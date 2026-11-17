import Link from "next/link";
import { Button } from "@/components/ui/button";

export function AdminNavigation({ current }: { current: "sessions" | "templates" | "access" }) {
  const items = [
    ["sessions", "Sessions", "/admin"],
    ["templates", "Templates", "/admin/templates"],
    ["access", "Committee and Professional access", "/admin/access"],
  ] as const;
  return <nav aria-label="Admin pages" className="mb-6 flex flex-wrap gap-2">{items.map(([key, label, href]) => <Button key={key} variant={current === key ? "default" : "outline"} nativeButton={false} render={<Link href={href}/>}>{label}</Button>)}</nav>;
}
