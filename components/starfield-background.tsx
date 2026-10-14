"use client"

import * as React from "react"

interface Star {
  x: number
  y: number
  r: number
  alpha: number
  twinkle: number
  twinkleSpeed: number
  vx: number
  vy: number
  z: number
}

function createStars(width: number, height: number, count: number): Star[] {
  const stars: Star[] = []
  for (let i = 0; i < count; i++) {
    // Three depth tiers: distant specks barely drift, near stars glide.
    const z = [0.35, 0.7, 1][i % 3]
    stars.push({
      x: Math.random() * width,
      y: Math.random() * height,
      r: (Math.random() * 1.4 + 0.4) * (0.6 + z * 0.6),
      alpha: Math.random() * 0.6 + 0.2,
      twinkle: Math.random() * Math.PI * 2,
      twinkleSpeed: Math.random() * 0.02 + 0.005,
      vx: (Math.random() - 0.5) * 0.15 * z,
      vy: (Math.random() - 0.5) * 0.15 * z,
      z,
    })
  }
  return stars
}

export function StarfieldBackground() {
  const canvasRef = React.useRef<HTMLCanvasElement>(null)
  const starsRef = React.useRef<Star[]>([])
  const frameRef = React.useRef<number>(0)
  const sizeRef = React.useRef({ width: 0, height: 0, dpr: 1 })

  React.useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      // Size to the parent section, not the window — the hero can exceed 100vh.
      const rect = canvas!.parentElement?.getBoundingClientRect()
      const width = Math.max(1, Math.floor(rect?.width ?? window.innerWidth))
      const height = Math.max(1, Math.floor(rect?.height ?? window.innerHeight))
      sizeRef.current = { width, height, dpr }
      canvas!.width = Math.floor(width * dpr)
      canvas!.height = Math.floor(height * dpr)
      canvas!.style.width = `${width}px`
      canvas!.style.height = `${height}px`
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0)

      const current = starsRef.current
      if (current.length === 0) {
        starsRef.current = createStars(width, height, 200)
      }
    }

    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches

    function draw() {
      const { width, height } = sizeRef.current
      ctx!.fillStyle = "#1F1208"
      ctx!.fillRect(0, 0, width, height)

      const stars = starsRef.current
      for (const star of stars) {
        if (!prefersReducedMotion) {
          star.x += star.vx
          star.y += star.vy

          if (star.x < 0) star.x += width
          if (star.x > width) star.x -= width
          if (star.y < 0) star.y += height
          if (star.y > height) star.y -= height

          star.twinkle += star.twinkleSpeed
        }

        const twinkle = Math.sin(star.twinkle) * 0.25 + 0.75
        const alpha = Math.max(
          0.05,
          Math.min(1, star.alpha * twinkle * (0.5 + star.z * 0.5)),
        )

        ctx!.beginPath()
        ctx!.arc(star.x, star.y, star.r, 0, Math.PI * 2)
        ctx!.fillStyle = `rgba(246, 241, 236, ${alpha})`
        ctx!.fill()
      }

      if (!prefersReducedMotion) {
        frameRef.current = requestAnimationFrame(draw)
      }
    }

    resize()
    draw()

    window.addEventListener("resize", resize)

    return () => {
      window.removeEventListener("resize", resize)
      cancelAnimationFrame(frameRef.current)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 h-full w-full"
    />
  )
}
