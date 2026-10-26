"use client";
import { Header } from "./Header";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      <main className="flex-1 min-w-0 w-full max-w-[1600px] mx-auto p-4 md:p-6">{children}</main>
    </div>
  );
}
