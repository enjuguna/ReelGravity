import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "ReelGravity — Find your next film", description: "A physical movie recommender powered by contextual fit." };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
