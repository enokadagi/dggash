"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff, Loader2, Play } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useAuthStore } from "@/stores/auth-store";
import { loginSchema, type LoginInput } from "@/lib/validations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function LoginPage() {
  const router = useRouter();
  const { signIn } = useAuth();
  const [showPassword, setShowPassword] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
    setValue,
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      phone: "",
      password: "",
      rememberMe: false,
    },
  });

  const onSubmit = async (data: LoginInput) => {
    setIsLoading(true);
    setError(null);
    try {
      await signIn(data.phone, data.password);
      router.push("/sales/pos");
    } catch (err: unknown) {
      const apiErr = err as { message?: string };
      setError(apiErr.message || "Invalid phone or password");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDemoLogin = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api/v1";
      const response = await fetch(`${apiBaseUrl}/auth/demo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.message || "Demo login failed");
      }
      const demoData = result.data || result;
      if (!demoData?.user || !demoData?.accessToken) {
        throw new Error("Demo login returned unexpected data");
      }
      const { user: userData, accessToken, refreshToken } = demoData;
      const { login } = useAuthStore.getState();
      login(userData, { accessToken, refreshToken });
      router.push("/sales/pos");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Demo login failed. Please try again.";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="w-full">
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl font-bold">Sign in</CardTitle>
        <CardDescription>
          Enter your phone number and password to access your account
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit(onSubmit)}>
        <CardContent className="space-y-4">
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="phone">Phone Number</Label>
            <Input
              id="phone"
              type="tel"
              placeholder="+1234567890"
              {...register("phone")}
              aria-invalid={!!errors.phone}
            />
            {errors.phone && (
              <p className="text-xs text-destructive">{errors.phone.message}</p>
            )}
            {!errors.phone && (
              <p className="text-xs text-muted-foreground">International format, e.g. +96170000000</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder="Enter your password"
                {...register("password")}
                aria-invalid={!!errors.password}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="absolute end-1 top-1/2 -translate-y-1/2"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
            {errors.password && (
              <p className="text-xs text-destructive">{errors.password.message}</p>
            )}
          </div>
          <div className="flex items-center">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="rememberMe"
                checked={watch("rememberMe")}
                onCheckedChange={(checked) => setValue("rememberMe", !!checked)}
              />
              <Label htmlFor="rememberMe" className="text-sm font-normal cursor-pointer">
                Remember me
              </Label>
            </div>
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-4">
          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
            Sign in
          </Button>

          <div className="relative w-full">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">Or</span>
            </div>
          </div>

          <Button
            type="button"
            variant="outline"
            className="w-full"
            disabled={isLoading}
            onClick={handleDemoLogin}
          >
            <Play className="me-2 h-4 w-4" />
            Try Demo Account
          </Button>

          {process.env.NODE_ENV !== "production" && (
            <p className="text-center text-xs text-muted-foreground">
              Demo &amp; admin login: +1000000000 / SuperAdmin123! · +96170000000 / Admin123!
            </p>
          )}
        </CardFooter>
      </form>
    </Card>
  );
}
