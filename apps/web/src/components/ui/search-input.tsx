"use client";

import * as React from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface SearchInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange"> {
  onSearch: (value: string) => void;
  debounceMs?: number;
  className?: string;
}

export function SearchInput({ onSearch, debounceMs = 300, className, placeholder = "Search...", ...props }: SearchInputProps) {
  const [value, setValue] = React.useState("");
  const timerRef = React.useRef<ReturnType<typeof setTimeout>>(undefined);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setValue(newValue);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => onSearch(newValue), debounceMs);
  };

  const handleClear = () => {
    setValue("");
    onSearch("");
  };

  return (
    <div className={cn("relative", className)}>
      <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={value}
        onChange={handleChange}
        placeholder={placeholder}
        className="ps-9 pe-9"
        {...props}
      />
      {value && (
        <Button
          variant="ghost"
          size="icon-sm"
          className="absolute end-1 top-1/2 h-6 w-6 -translate-y-1/2"
          onClick={handleClear}
          aria-label="Clear search"
        >
          <X className="h-3 w-3" />
        </Button>
      )}
    </div>
  );
}
