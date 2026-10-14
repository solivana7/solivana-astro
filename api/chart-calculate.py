from http.server import BaseHTTPRequestHandler
import calendar
import datetime as py_dt
import json
import os
import re

import swisseph as swe
from flatlib import const, chart as fl_chart, datetime as fl_dt, geopos
from flatlib import aspects as fl_aspects


SIGNS = [
    "Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo",
    "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces",
]

NAKSHATRAS = [
    "Ashwini", "Bharani", "Krittika", "Rohini", "Mrigashira", "Ardra",
    "Punarvasu", "Pushya", "Ashlesha", "Magha", "Purva Phalguni", "Uttara Phalguni",
    "Hasta", "Chitra", "Swati", "Vishakha", "Anuradha", "Jyeshtha",
    "Mula", "Purva Ashadha", "Uttara Ashadha", "Shravana", "Dhanishta",
    "Shatabhisha", "Purva Bhadrapada", "Uttara Bhadrapada", "Revati",
]

# Vimshottari lords repeat every 9 nakshatras.
NAKSHATRA_LORDS = [
    "Ketu", "Venus", "Sun", "Moon", "Mars", "Rahu",
    "Jupiter", "Saturn", "Mercury",
] * 3

DASHA_PERIODS = {
    "Ketu": 7,
    "Venus": 20,
    "Sun": 6,
    "Moon": 10,
    "Mars": 7,
    "Rahu": 18,
    "Jupiter": 16,
    "Saturn": 19,
    "Mercury": 17,
}

ATMAKARAKA_PLANETS = [const.SUN, const.MOON, const.MARS, const.MERCURY,
                       const.JUPITER, const.VENUS, const.SATURN,
                       const.NORTH_NODE]


def _ensure_sid_mode():
    """Set Swiss Ephemeris sidereal mode to Lahiri for this request."""
    swe.set_sid_mode(swe.SIDM_LAHIRI)


def _format_offset_hours(offset_hours):
    sign = "+" if offset_hours >= 0 else "-"
    total_minutes = abs(int(round(offset_hours * 60)))
    hours = total_minutes // 60
    minutes = total_minutes % 60
    return f"{sign}{hours:02d}:{minutes:02d}"


def _parse_utc_offset(tz):
    """Parse an offset string like '+03:00' / '+0300' / '+3' into hours.

    Returns None if tz is not a valid offset string.
    Raises ValueError for malformed offset strings.
    """
    tz = str(tz).strip()
    if tz.upper() in ("UTC", "Z", "GMT"):
        return 0.0

    m = re.match(r"^([+-])(\d{1,2})(?::?(\d{2}))?$", tz)
    if not m:
        return None

    sign = 1 if m.group(1) == "+" else -1
    hours = int(m.group(2))
    minutes = int(m.group(3) or 0)

    if minutes >= 60:
        raise ValueError(f"invalid timezone offset minutes: {minutes}")
    if hours > 14:
        raise ValueError(f"invalid timezone offset hours: {hours}")

    return sign * (hours + minutes / 60)


def _parse_birth_datetime(date, time, tz):
    """Parse birth date/time/timezone into a naive UTC datetime.

    Supports 'YYYY-MM-DD' / 'YYYY/MM/DD' dates, 'HH:MM' times, and
    IANA timezone names or UTC offsets like '+03:00'.

    Returns a tuple of (birth_utc, utc_offset_str).
    Raises ValueError on invalid input.
    """
    date_norm = str(date).replace("/", "-")
    try:
        year, month, day = map(int, date_norm.split("-"))
    except ValueError as exc:
        raise ValueError(f"invalid date format: {date!r}") from exc

    try:
        hour, minute = map(int, str(time).split(":")[:2])
    except ValueError as exc:
        raise ValueError(f"invalid time format: {time!r}") from exc

    if not (1 <= month <= 12):
        raise ValueError(f"invalid month: {month}")
    if not (1 <= day <= 31):
        raise ValueError(f"invalid day: {day}")
    if not (0 <= hour <= 23):
        raise ValueError(f"invalid hour: {hour}")
    if not (0 <= minute <= 59):
        raise ValueError(f"invalid minute: {minute}")

    tz = str(tz).strip()
    offset_hours = _parse_utc_offset(tz)
    if offset_hours is not None:
        try:
            local_dt = py_dt.datetime(year, month, day, hour, minute)
        except ValueError as exc:
            raise ValueError(f"invalid birth datetime: {exc}") from exc
        birth_utc = local_dt - py_dt.timedelta(hours=offset_hours)
        return birth_utc, _format_offset_hours(offset_hours)

    try:
        import zoneinfo
    except ImportError as exc:
        raise ValueError("IANA timezones require zoneinfo (Python 3.9+)") from exc

    try:
        tzinfo = zoneinfo.ZoneInfo(tz)
    except zoneinfo.ZoneInfoNotFoundError as exc:
        raise ValueError(f"unknown timezone: {tz!r}") from exc

    try:
        aware_dt = py_dt.datetime(year, month, day, hour, minute, tzinfo=tzinfo)
    except ValueError as exc:
        raise ValueError(f"invalid birth datetime: {exc}") from exc

    offset = aware_dt.utcoffset()
    if offset is None:
        raise ValueError(f"could not determine UTC offset for timezone: {tz!r}")

    birth_utc = aware_dt.astimezone(py_dt.timezone.utc).replace(tzinfo=None)
    return birth_utc, _format_offset_hours(offset.total_seconds() / 3600)


def _normalize_date_for_flatlib(date):
    """Convert 'YYYY-MM-DD' or 'YYYY/MM/DD' to the 'YYYY/MM/DD' flatlib expects."""
    parts = str(date).replace("-", "/").split("/")
    if len(parts) != 3:
        raise ValueError(f"invalid date format: {date!r}")
    try:
        year, month, day = map(int, parts)
    except ValueError as exc:
        raise ValueError(f"invalid date format: {date!r}") from exc
    return f"{year:04d}/{month:02d}/{day:02d}"


def _geo_str(value, positive, negative):
    """Convert decimal degrees to flatlib's DMS string format (e.g. 55n45)."""
    value = float(value)
    letter = positive if value >= 0 else negative
    value = abs(value)
    degrees = int(value)
    minutes = int(round((value - degrees) * 60))
    if minutes >= 60:
        degrees += 1
        minutes = 0
    return f"{degrees}{letter}{minutes}"


def _sign_name(lon):
    return SIGNS[int(float(lon) // 30) % 12]


def _sidereal_lon(tropical_lon, ayanamsa):
    return (float(tropical_lon) - ayanamsa) % 360


def _nakshatra_data(lon):
    """Return (name, index 0-26, pada 1-4, lord) for a sidereal longitude."""
    lon = float(lon) % 360
    span = 360 / 27
    idx = int(lon // span)
    rem = lon % span
    pada = int(rem // (span / 4)) + 1
    return NAKSHATRAS[idx], idx, pada, NAKSHATRA_LORDS[idx]


def _house_of(lon, houses):
    """Return the house number containing the given longitude."""
    lon = float(lon) % 360
    cusps = [(h.num(), float(h.lon)) for h in houses]
    cusps.sort(key=lambda x: x[1])
    for i, (num, cusp) in enumerate(cusps):
        nxt = cusps[(i + 1) % len(cusps)][1]
        if nxt > cusp:
            if cusp <= lon < nxt:
                return num
        else:
            if lon >= cusp or lon < nxt:
                return num
    return 1


def _whole_sign_house(sid_lon, lagna_sid_lon):
    """Whole-sign house from the sidereal lagna (standard Vedic convention):
    sign positions, not degrees — the lagna's entire sign is house 1."""
    if lagna_sid_lon is None:
        return None
    return int((float(sid_lon) // 30 - lagna_sid_lon // 30) % 12) + 1


def _dasha_timeline(moon_nakshatra_idx, moon_lon, birth_jd, birth_utc):
    """Return Vimshottari Mahadasha periods from birth."""
    span = 360 / 27
    nak_start = moon_nakshatra_idx * span
    fraction_remaining = 1 - ((moon_lon - nak_start) / span)
    start_lord = NAKSHATRA_LORDS[moon_nakshatra_idx]
    start_years = fraction_remaining * DASHA_PERIODS[start_lord]

    # Build the lord sequence starting from the birth lord.
    base_order = ["Ketu", "Venus", "Sun", "Moon", "Mars", "Rahu",
                  "Jupiter", "Saturn", "Mercury"]
    start_i = base_order.index(start_lord)
    sequence = [base_order[(start_i + k) % 9] for k in range(9)]

    timeline = []
    # Use a UTC datetime as the anchor; convert JD to datetime.
    current = birth_utc
    for lord in sequence:
        years = start_years if lord == start_lord else DASHA_PERIODS[lord]
        end = current + py_dt.timedelta(days=years * 365.2425)
        timeline.append({
            "lord": lord,
            "start": current.isoformat(),
            "end": end.isoformat(),
            "years": round(years, 4),
        })
        current = end
    return timeline


def _current_dasha_lord(dasha_timeline, now_utc):
    """Return the Mahadasha lord active at the given UTC datetime."""
    for period in dasha_timeline:
        start = py_dt.datetime.fromisoformat(period["start"])
        end = py_dt.datetime.fromisoformat(period["end"])
        if start <= now_utc < end:
            return period["lord"]
    return dasha_timeline[-1]["lord"] if dasha_timeline else None


def _atmakaraka(planets_by_id, ayanamsa):
    """Return the planet with the highest sidereal degree (8-karaka scheme).

    Rahu (North Node) is always retrograde, so its degree counts in reverse
    (30 - deg) per the standard Parashari convention.
    """
    candidates = []
    for pid in ATMAKARAKA_PLANETS:
        obj = planets_by_id.get(pid)
        if obj is None:
            continue
        sid = _sidereal_lon(obj.lon, ayanamsa)
        deg = sid % 30
        if pid == const.NORTH_NODE:
            deg = (30 - deg) % 30
        candidates.append((deg, obj.id))
    if not candidates:
        return None
    candidates.sort(reverse=True)
    return candidates[0][1]


def _yogas(planets_by_id, houses, ayanamsa):
    """Detect a small set of common yogas from planetary positions."""
    names = []
    sid = {pid: _sidereal_lon(obj.lon, ayanamsa) for pid, obj in planets_by_id.items()}

    def _has(planet_id):
        return planet_id in planets_by_id

    def _diff(a, b):
        return abs((sid[a] - sid[b] + 180) % 360 - 180)

    # Gaja-Kesari yoga: Moon and Jupiter in angles/kendras from each other (0,90,180).
    if _has(const.MOON) and _has(const.JUPITER):
        d = _diff(const.MOON, const.JUPITER)
        if d < 10 or abs(d - 90) < 10 or abs(d - 180) < 10:
            names.append("Gaja-Kesari")

    # Budha-Aditya yoga: Sun and Mercury in same sign.
    if _has(const.SUN) and _has(const.MERCURY):
        if int(sid[const.SUN] // 30) == int(sid[const.MERCURY] // 30):
            names.append("Budha-Aditya")

    # Chandra-Mangala yoga: Moon and Mars conjunct.
    if _has(const.MOON) and _has(const.MARS):
        if _diff(const.MOON, const.MARS) < 10:
            names.append("Chandra-Mangala")

    # Guru-Mangala yoga: Jupiter and Mars conjunct.
    if _has(const.JUPITER) and _has(const.MARS):
        if _diff(const.JUPITER, const.MARS) < 10:
            names.append("Guru-Mangala")

    # A simple Raja Yoga placeholder: if 9th lord and 10th lord are connected.
    # Skipped in Phase 2 to keep calculations simple.
    return names


def _western_aspects(planets_by_id):
    """Return major aspect strings for the true planets."""
    aspect_angles = [0, 60, 90, 120, 180]
    aspect_names = {0: "conjunct", 60: "sextile", 90: "square",
                    120: "trine", 180: "opposition"}
    ids = [const.SUN, const.MOON, const.MERCURY, const.VENUS, const.MARS,
           const.JUPITER, const.SATURN]
    labels = {const.SUN: "Sun", const.MOON: "Moon", const.MERCURY: "Mercury",
              const.VENUS: "Venus", const.MARS: "Mars", const.JUPITER: "Jupiter",
              const.SATURN: "Saturn"}
    results = []
    seen = set()
    for i, a in enumerate(ids):
        for b in ids[i + 1:]:
            obj_a = planets_by_id.get(a)
            obj_b = planets_by_id.get(b)
            if obj_a is None or obj_b is None:
                continue
            asp = fl_aspects.getAspect(obj_a, obj_b, aspect_angles)
            if asp is not None and asp.type in aspect_names and abs(asp.orb) < 8:
                key = tuple(sorted([labels[a], labels[b]]))
                if key in seen:
                    continue
                seen.add(key)
                name = aspect_names[asp.type]
                results.append(f"{labels[a]} {name} {labels[b]} (orb {round(asp.orb, 2)}°)")
    return results


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        # Internal endpoint: only our chart service may call it (shared secret).
        expected_secret = os.environ.get("INTERNAL_API_SECRET", "")
        if not expected_secret or self.headers.get("x-internal-secret") != expected_secret:
            self._send_json(401, {"error": "Unauthorized"})
            return

        content_length = int(self.headers.get("Content-Length", "0"))
        if content_length > 16384:
            self._send_json(413, {"error": "Payload too large"})
            return

        _ensure_sid_mode()

        raw_body = self.rfile.read(content_length).decode("utf-8")

        try:
            body = json.loads(raw_body)
        except json.JSONDecodeError:
            self._send_json(400, {"error": "Invalid JSON body"})
            return

        date = body.get("date")
        time = body.get("time")
        tz = body.get("timezone")
        lat = body.get("lat")
        lon = body.get("lon")

        if not all(v is not None for v in (date, time, tz, lat, lon)):
            self._send_json(400, {"error": "Missing required fields: date, time, timezone, lat, lon"})
            return

        try:
            lat = float(lat)
            lon = float(lon)
        except (TypeError, ValueError):
            self._send_json(400, {"error": "lat and lon must be numbers"})
            return

        try:
            birth_utc, utc_offset = _parse_birth_datetime(date, time, tz)
        except ValueError as exc:
            self._send_json(400, {"error": f"Invalid birth datetime: {exc}"})
            return

        try:
            flatlib_date = _normalize_date_for_flatlib(date)
            dt = fl_dt.Datetime(flatlib_date, time, utc_offset)
            pos = geopos.GeoPos(
                _geo_str(lat, "n", "s"),
                _geo_str(lon, "e", "w"),
            )
            chart = fl_chart.Chart(dt, pos, hsys=const.HOUSES_PLACIDUS)
        except ValueError as exc:
            self._send_json(400, {"error": f"Invalid chart parameters: {exc}"})
            return

        ayanamsa = swe.get_ayanamsa_ut(dt.jd)
        planets_by_id = {obj.id: obj for obj in chart.objects}

        weekday = calendar.day_name[birth_utc.weekday()]

        planets = {}
        for obj in chart.objects:
            sid_lon = _sidereal_lon(obj.lon, ayanamsa)
            nak_name, nak_idx, pada, lord = _nakshatra_data(sid_lon)
            planets[obj.id] = {
                "tropicalLon": obj.lon,
                "tropicalSign": obj.sign,
                "tropicalDeg": obj.signlon,
                "siderealLon": sid_lon,
                "siderealSign": _sign_name(sid_lon),
                "siderealDeg": sid_lon % 30,
                "nakshatra": nak_name,
                "nakshatraIdx": nak_idx,
                "pada": pada,
                "nakshatraLord": lord,
                "signNum": int(obj.lon // 30),
                "vedicSignNum": int(sid_lon // 30),
                "house": _house_of(obj.lon, chart.houses),
            }

        houses = {}
        asc = None
        mc = None
        for h in chart.houses:
            houses[str(h.id)] = {
                "number": h.num(),
                "lon": h.lon,
                "sign": h.sign,
            }
            if h.num() == 1:
                asc = h
            elif h.num() == 10:
                mc = h

        # Lagna (Vedic) is the SIDEREAL ascendant: tropical ascendant shifted
        # by the ayanamsa. The Western ascendant stays tropical.
        lagna_sid_lon = _sidereal_lon(asc.lon, ayanamsa) if asc else None
        lagna_sign = _sign_name(lagna_sid_lon) if lagna_sid_lon is not None else "Unknown"
        ascendant_sign = asc.sign if asc else "Unknown"
        midheaven_sign = mc.sign if mc else "Unknown"

        # Vedic house = whole-sign house counted from the sidereal lagna.
        for p in planets.values():
            p["vedicHouse"] = _whole_sign_house(p["siderealLon"], lagna_sid_lon)

        moon_obj = planets_by_id.get(const.MOON)
        sun_obj = planets_by_id.get(const.SUN)
        moon_sign = planets["Moon"]["siderealSign"] if moon_obj else "Unknown"
        sun_sign = planets["Sun"]["siderealSign"] if sun_obj else "Unknown"

        atmakaraka = _atmakaraka(planets_by_id, ayanamsa)

        dasha_timeline = []
        if moon_obj:
            moon_nak, moon_nak_idx, _, _ = _nakshatra_data(
                _sidereal_lon(moon_obj.lon, ayanamsa)
            )
            dasha_timeline = _dasha_timeline(
                moon_nak_idx,
                _sidereal_lon(moon_obj.lon, ayanamsa),
                dt.jd,
                birth_utc,
            )

        current_dasha_lord = _current_dasha_lord(
            dasha_timeline, py_dt.datetime.now(py_dt.timezone.utc).replace(tzinfo=None)
        )

        yogas = _yogas(planets_by_id, chart.houses, ayanamsa)
        western_aspects = _western_aspects(planets_by_id)

        response = {
            "birthInfo": {
                "date": date,
                "time": time,
                "timezone": tz,
                "location": f"{lat}, {lon}",
                "lat": lat,
                "lon": lon,
                "weekday": weekday,
                "julianDay": dt.jd,
            },
            "planets": planets,
            "houses": houses,
            "vedicSummary": {
                "lagnaSign": lagna_sign,
                "moonSign": moon_sign,
                "sunSign": sun_sign,
                "atmakaraka": atmakaraka,
                "currentDashaLord": current_dasha_lord,
            },
            "westernSummary": {
                "ascendantSign": ascendant_sign,
                "midheavenSign": midheaven_sign,
            },
            "dashaTimeline": dasha_timeline,
            "yogas": yogas,
            "westernAspects": western_aspects,
        }

        self._send_json(200, response)

    def _send_json(self, status_code, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)
