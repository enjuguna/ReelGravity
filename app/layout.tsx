import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import "./globals.css";
const poppins = Poppins({ subsets: ["latin"], weight: ["400", "500", "600", "700"], display: "swap", variable: "--font-poppins" });
export const metadata: Metadata = { title: "ReelGravity - Find your next film", description: "A physical movie recommender powered by contextual fit." };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body className={poppins.variable}>{children}</body></html>; }
