export const metadata = {
  title: "Oldi-berdi API",
  description: "Server sync for Oldi-berdi Android app",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="uz">
      <body style={{ fontFamily: "system-ui", margin: 24 }}>{children}</body>
    </html>
  );
}
