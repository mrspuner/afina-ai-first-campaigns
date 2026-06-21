import type { Metadata } from "next";
import { Onest } from "next/font/google";
import "./globals.css";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppStateProvider } from "@/state/app-state-context";

const onest = Onest({
  variable: "--font-sans",
  subsets: ["latin", "cyrillic"],
});

export const metadata: Metadata = {
  title: "Afina clp",
  description: "Afina — campaign automation prototype",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${onest.variable} h-full antialiased dark`}
    >
      <head>
        {/* eslint-disable-next-line @next/next/no-sync-scripts */}
        <script src="https://mcp.figma.com/mcp/html-to-design/capture.js" async></script>
      </head>
      <body className="min-h-full flex flex-col">
        <TooltipProvider>
          <AppStateProvider>{children}</AppStateProvider>
        </TooltipProvider>
      {/* aim:injected */}
        {process.env.NODE_ENV === "development" && (
          <script src="http://localhost:8765/overlay.js" async></script>
        )}
        {/* /aim:injected */}
        </body>
    </html>
  );
}
