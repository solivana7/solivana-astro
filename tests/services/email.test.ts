import { describe, it, expect, vi, beforeEach } from "vitest"
import { sendCompletionEmail, sendReportShareEmail } from "@/lib/services/email"

const mockSend = vi.hoisted(() => vi.fn())

vi.mock("resend", () => ({
  Resend: class {
    emails = { send: mockSend }
  },
}))

describe("sendCompletionEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.RESEND_API_KEY
    delete process.env.FROM_EMAIL
    delete process.env.APP_URL
  })

  it("logs a warning and returns when RESEND_API_KEY is missing", async () => {
    process.env.FROM_EMAIL = "readings@example.com"
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})

    await sendCompletionEmail("user@example.com", "User", "reading-uuid")

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("RESEND_API_KEY or FROM_EMAIL is missing"),
    )
    expect(mockSend).not.toHaveBeenCalled()

    warnSpy.mockRestore()
  })

  it("logs a warning and returns when FROM_EMAIL is missing", async () => {
    process.env.RESEND_API_KEY = "re_test"
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})

    await sendCompletionEmail("user@example.com", "User", "reading-uuid")

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("RESEND_API_KEY or FROM_EMAIL is missing"),
    )
    expect(mockSend).not.toHaveBeenCalled()

    warnSpy.mockRestore()
  })

  it("sends an HTML email with reading and download links when configured", async () => {
    process.env.RESEND_API_KEY = "re_test"
    process.env.FROM_EMAIL = "readings@example.com"
    process.env.APP_URL = "https://app.example.com"
    mockSend.mockResolvedValue({ data: { id: "email-id" }, error: null })

    await sendCompletionEmail("user@example.com", "User", "reading-uuid")

    expect(mockSend).toHaveBeenCalledTimes(1)
    const call = mockSend.mock.calls[0][0]
    expect(call.from).toBe("readings@example.com")
    expect(call.to).toBe("user@example.com")
    expect(call.bcc).toBe("readings@example.com")
    expect(call.subject).toBe("Your Karmic Interpreter reading is ready")
    expect(call.html).toContain("https://app.example.com/reading/reading-uuid")
    // Downloads go through the app route, which streams the private blobs.
    expect(call.html).toContain(
      "https://app.example.com/api/reading/reading-uuid/download?type=docx",
    )
    expect(call.html).toContain(
      "https://app.example.com/api/reading/reading-uuid/download?type=pdf",
    )
    expect(call.html).toContain(
      "https://app.example.com/api/reading/reading-uuid/download?type=ics",
    )
  })

  it("does not throw when Resend returns an error", async () => {
    process.env.RESEND_API_KEY = "re_test"
    process.env.FROM_EMAIL = "readings@example.com"
    mockSend.mockResolvedValue({ data: null, error: { message: "Bounced" } })
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})

    await expect(
      sendCompletionEmail("user@example.com", "User", "reading-uuid"),
    ).resolves.toBeUndefined()

    errorSpy.mockRestore()
  })

  it("does not throw when sending throws", async () => {
    process.env.RESEND_API_KEY = "re_test"
    process.env.FROM_EMAIL = "readings@example.com"
    mockSend.mockRejectedValue(new Error("network down"))
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})

    await expect(
      sendCompletionEmail("user@example.com", "User", "reading-uuid"),
    ).resolves.toBeUndefined()

    errorSpy.mockRestore()
  })
})

describe("sendReportShareEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.RESEND_API_KEY
    delete process.env.FROM_EMAIL
    delete process.env.APP_URL
  })

  it("sends the PDF as an attachment with view and download links", async () => {
    process.env.RESEND_API_KEY = "re_test"
    process.env.FROM_EMAIL = "info@solivana.com"
    process.env.APP_URL = "https://app.example.com"
    mockSend.mockResolvedValue({ data: { id: "email-id" }, error: null })

    const pdfBuffer = Buffer.from("pdf-bytes")
    const sent = await sendReportShareEmail({
      to: "friend@example.com",
      ownerName: "Natasha",
      readingId: "reading-uuid",
      pdfBuffer,
    })

    expect(sent).toBe(true)
    const call = mockSend.mock.calls[0][0]
    expect(call.from).toBe("info@solivana.com")
    expect(call.to).toBe("friend@example.com")
    expect(call.subject).toContain("Natasha")
    expect(call.html).toContain("https://app.example.com/reading/reading-uuid")
    expect(call.html).toContain("download?type=docx")
    expect(call.attachments).toEqual([
      {
        filename: "karmic-reading.pdf",
        content: pdfBuffer.toString("base64"),
      },
    ])
  })

  it("returns false when Resend errors", async () => {
    process.env.RESEND_API_KEY = "re_test"
    process.env.FROM_EMAIL = "info@solivana.com"
    mockSend.mockResolvedValue({ data: null, error: { message: "Bounced" } })
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})

    const sent = await sendReportShareEmail({
      to: "friend@example.com",
      ownerName: "Natasha",
      readingId: "reading-uuid",
      pdfBuffer: Buffer.from("pdf-bytes"),
    })

    expect(sent).toBe(false)
    errorSpy.mockRestore()
  })

  it("returns false when Resend is not configured", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})

    const sent = await sendReportShareEmail({
      to: "friend@example.com",
      ownerName: "Natasha",
      readingId: "reading-uuid",
      pdfBuffer: Buffer.from("pdf-bytes"),
    })

    expect(sent).toBe(false)
    expect(mockSend).not.toHaveBeenCalled()
    warnSpy.mockRestore()
  })
})
