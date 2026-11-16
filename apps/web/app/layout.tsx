import type { Metadata } from "next";
import "./globals.css";
import localFont from "next/font/local";
const terminal = localFont({
  src: [
    { path: "./fonts/DejaVuSansMono.ttf", weight: "400", style: "normal" },
    { path: "./fonts/DejaVuSansMono-Bold.ttf", weight: "700", style: "normal" },
  ],
  variable: "--font-terminal",
  display: "swap",
});
export const metadata: Metadata = {
  title: "Markup Ventures | Operations Console",
  description: "Fleet telemetry, asset state and maintenance records.",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <body className={terminal.variable}>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('markup.theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t;}catch(e){}`,
          }}
        />
        {children}
      </body>
    </html>
  );
}
