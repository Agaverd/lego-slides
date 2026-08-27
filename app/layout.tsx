import type { Metadata } from "next";
import "@gravity-ui/uikit/styles/fonts.css";
import "@gravity-ui/uikit/styles/styles.css";
import "./design-system.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Demo Slides",
  description: "Сборка аккуратных демо-презентаций из адаптивных блоков.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body>
        {children}
      </body>
    </html>
  );
}
