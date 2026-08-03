import Link from "next/link";

import { Logo } from "@/components/brand/logo";
import { cn } from "@/lib/utils";

/** Centered card layout shared by the forgot-password and OTP screens. */
export function AuthCard({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-surface-light px-6 py-10">
      <Link href="/" className="mb-10">
        <Logo />
      </Link>
      <div
        className={cn(
          "w-full max-w-[400px] rounded-2xl bg-white px-10 py-9 shadow-[0_4px_24px_rgba(15,23,42,0.08)]",
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}
