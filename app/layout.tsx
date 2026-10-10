import type { Metadata, Viewport } from "next";
import { Inter, Poppins } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import DashboardClerkProvider from "@/components/DashboardClerkProvider";
import RegisterSw from "@/components/public/RegisterSw";
import { isClerkConfigured } from "@/lib/clerkConfig";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: "700",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://dashboard.projectneptune.co"),
  title: {
    default: "Beaches near me",
    template: "%s — Neptune",
  },
  description:
    "Today’s ocean water quality for California beaches. No account. A model estimate, not a water sample.",
  applicationName: "Neptune",
  appleWebApp: { capable: true, title: "Neptune", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#0e6f78",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const page = (
    <html
      lang="en"
      className={`${inter.variable} ${poppins.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-white text-gray-900">
        {children}
        <RegisterSw />
        <Analytics />
      </body>
    </html>
  );

  // Wrapped only when Clerk is configured. ClerkProvider without keys throws,
  // which would take down every board over a feature no board requires — the
  // same way the unconfigured PostHog instrumentation took down the dev server
  // earlier. Nothing here needs an account, so nothing here should break
  // without one.
  return isClerkConfigured() ? <DashboardClerkProvider>{page}</DashboardClerkProvider> : page;
}
