"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { CheckCircleIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input, FieldError } from "@/components/ui/field";

export function WaitlistForm() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = useMutation({
    mutationFn: async (value: string) => {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: value }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(body?.error?.message ?? "Could not save your address.");
      }
      return true;
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Something went wrong."),
  });

  if (submit.isSuccess) {
    return (
      <p className="inline-flex items-center gap-2 text-[14px]" style={{ color: "var(--positive)" }}>
        <CheckCircleIcon size={17} weight="regular" />
        Saved. You&rsquo;ll hear from us when allotment alerts are ready.
      </p>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        submit.mutate(email.trim());
      }}
      noValidate
      className="max-w-md"
    >
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          aria-label="Email address"
          autoComplete="email"
          invalid={Boolean(error)}
          aria-describedby={error ? "waitlist-error" : undefined}
        />
        <Button type="submit" variant="primary" disabled={submit.isPending} className="sm:w-auto">
          {submit.isPending ? "Saving…" : "Notify me"}
        </Button>
      </div>
      <FieldError id="waitlist-error">{error}</FieldError>
      <p className="mt-2 text-[12px] text-dim">
        One email when allotment alerts ship. No newsletter. See the{" "}
        <Link href="/privacy" className="underline underline-offset-2 hover:no-underline">
          privacy policy
        </Link>
        .
      </p>
    </form>
  );
}
