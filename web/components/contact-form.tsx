"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { CheckCircleIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Input, Label, FieldError, Textarea } from "@/components/ui/field";

type Fields = { name: string; email: string; message: string };

export function ContactForm() {
  const [fields, setFields] = useState<Fields>({ name: "", email: "", message: "" });
  const [errors, setErrors] = useState<{ email?: string; message?: string }>({});

  const submit = useMutation({
    mutationFn: async (body: Fields) => {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: body.name.trim() || undefined,
          email: body.email.trim(),
          message: body.message.trim(),
        }),
      });
      const parsed = await res.json().catch(() => null);
      if (!res.ok) {
        const code = parsed?.error?.code as string | undefined;
        const message = parsed?.error?.message ?? "Could not send your message.";
        setErrors(code === "EMAIL_INVALID" ? { email: message } : { message });
        throw new Error(message);
      }
      return true;
    },
  });

  if (submit.isSuccess) {
    return (
      <p className="inline-flex items-center gap-2 text-[14px]" style={{ color: "var(--positive)" }}>
        <CheckCircleIcon size={17} weight="regular" />
        Sent. We read every message and reply from allotwise@gmail.com.
      </p>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setErrors({});
        submit.mutate(fields);
      }}
      noValidate
      className="max-w-md space-y-4"
    >
      <div>
        <div className="flex items-baseline justify-between">
          <Label htmlFor="contact-name">Name</Label>
          <span className="text-[11px] text-dim">Optional</span>
        </div>
        <div className="mt-1.5">
          <Input
            id="contact-name"
            value={fields.name}
            onChange={(e) => setFields((f) => ({ ...f, name: e.target.value }))}
            placeholder="Your name"
            maxLength={80}
            autoComplete="name"
          />
        </div>
      </div>

      <div>
        <Label htmlFor="contact-email">Email</Label>
        <div className="mt-1.5">
          <Input
            id="contact-email"
            type="email"
            value={fields.email}
            onChange={(e) => setFields((f) => ({ ...f, email: e.target.value }))}
            placeholder="you@example.com"
            autoComplete="email"
            invalid={Boolean(errors.email)}
            aria-describedby={errors.email ? "contact-email-error" : undefined}
          />
        </div>
        <FieldError id="contact-email-error">{errors.email}</FieldError>
      </div>

      <div>
        <Label htmlFor="contact-message">Message</Label>
        <div className="mt-1.5">
          <Textarea
            id="contact-message"
            value={fields.message}
            onChange={(e) => setFields((f) => ({ ...f, message: e.target.value }))}
            placeholder="What's going on?"
            rows={5}
            maxLength={4000}
            invalid={Boolean(errors.message)}
            aria-describedby={errors.message ? "contact-message-error" : undefined}
          />
        </div>
        <FieldError id="contact-message-error">{errors.message}</FieldError>
      </div>

      <Button type="submit" variant="primary" disabled={submit.isPending}>
        {submit.isPending ? "Sending…" : "Send message"}
      </Button>
    </form>
  );
}
