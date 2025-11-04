import { useTheme } from "@/components/ThemeProvider"
import { Toaster as Sonner, toast } from "sonner"
import type { ComponentProps } from "react"

type ToasterProps = ComponentProps<typeof Sonner>

const getSystemThemePreference = (): Exclude<ToasterProps["theme"], undefined> => {
  if (typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches) {
    return "dark"
  }
  return "light"
}

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme } = useTheme()

  // Map our ThemeProvider's theme to an explicit value for Sonner
  const effectiveTheme: ToasterProps["theme"] =
    theme === "system" ? getSystemThemePreference() : (theme as ToasterProps["theme"])

  return (
    <Sonner
      theme={effectiveTheme}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton:
            "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton:
            "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  )
}

export { Toaster, toast }
