import { test, expect } from "@playwright/test"

test.describe("landing page", () => {
  test("renders hero and navigates to the sample reading", async ({ page }) => {
    await page.goto("/")
    await expect(
      page.getByRole("heading", { name: /Your cosmic blueprint/i }),
    ).toBeVisible()
    await expect(page.getByText("SOLIVANA ASTRO").first()).toBeVisible()

    await page.getByRole("link", { name: "See a sample reading" }).click()
    await expect(page).toHaveURL(/\/sample$/)
    await expect(
      page.getByRole("heading", { name: /real SoliVana AI reading/i }),
    ).toBeVisible()
    // The dashboard renders the actual report content.
    await expect(page.getByText("Your personalized synthesis")).toBeVisible()
  })
})

test.describe("birth form", () => {
  test("completes step 1 and reaches the birth moment step", async ({
    page,
  }) => {
    await page.goto("/reading")

    await page.getByLabel("Name").fill("Browser Test")
    await page.getByLabel("Email").fill("browser@example.com")
    await page.getByRole("button", { name: "Next", exact: true }).click()

    await expect(page.getByLabel("Birth date")).toBeVisible()

    // The timezone combobox shows city + offset and filters by typing.
    const timezone = page.getByRole("combobox", { name: "" }).first()
    await timezone.click()
    await timezone.fill("dubai")
    await expect(page.getByRole("option").first()).toBeVisible()
    await expect(page.getByRole("option").first()).toContainText("Dubai")
    await expect(page.getByRole("option").first()).toContainText("UTC+4")
  })
})
