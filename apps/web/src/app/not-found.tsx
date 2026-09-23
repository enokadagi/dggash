import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-4">
      <h2 className="text-4xl font-bold">404</h2>
      <p className="text-muted-foreground">Page not found</p>
      <Link href="/dashboard">
        <Button variant="outline">Go to Dashboard</Button>
      </Link>
    </div>
  );
}
