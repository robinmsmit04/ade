"use client";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { authSchema } from "@/lib/domain";
import { getSupabase } from "@/lib/supabase";
export function AuthForm() {
  const [mode, setMode] = useState<"login" | "signup" | "reset" | "password">(
    "login",
  );
  const [message, setMessage] = useState("");
  const [error, setError] = useState(() =>
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).has("auth_error")
      ? "De bevestigingslink is ongeldig of verlopen. Vraag een herstelmail aan."
      : "",
  );
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof authSchema>>({
    resolver: zodResolver(authSchema),
  });
  async function submit(values: z.infer<typeof authSchema>) {
    setError("");
    setMessage("");
    const client = getSupabase();
    try {
      if (mode === "signup") {
        const { error } = await client.auth.signUp({
          ...values,
          options: {
            emailRedirectTo: `${location.origin}/auth/callback${sessionStorage.getItem("crew-invite") ? "?next=/invite/" + sessionStorage.getItem("crew-invite") : ""}`,
            data: { display_name: values.email.split("@")[0] },
          },
        });
        if (error) throw error;
        setMessage("Controleer je e-mail om je account te bevestigen.");
      } else if (mode === "password") {
        const { error } = await client.auth.updateUser({
          password: values.password,
        });
        if (error) throw error;
        setMessage("Wachtwoord bijgewerkt.");
      } else {
        const { error } = await client.auth.signInWithPassword(values);
        if (error) throw error;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Inloggen mislukt.");
    }
  }
  async function reset() {
    setError("");
    const email = (document.getElementById("email") as HTMLInputElement)?.value;
    if (!email) {
      setError("Vul eerst je e-mailadres in.");
      return;
    }
    const { error } = await getSupabase().auth.resetPasswordForEmail(email, {
      redirectTo: `${location.origin}/auth/callback`,
    });
    if (error) setError(error.message);
    else
      setMessage(
        "Als dit account bestaat, ontvang je een herstelmail. Open daarna Instellingen om je wachtwoord te wijzigen.",
      );
  }
  return (
    <div className="auth">
      <div className="brand">
        <span className="brand-mark">cc</span> CREW CONTROL
      </div>
      <div className="card stack">
        <span className="eyebrow">CREW CONTROL · ADE</span>
        <h1>
          {mode === "signup" ? "Welkom bij de crew." : "Terug bij je crew."}
        </h1>
        <p className="muted text-sm leading-6">
          Maak een account, bevestig je e-mail en doe mee. Iedereen met deze
          website kan deelnemen. Jij bepaalt wat je deelt.
        </p>
        <form className="stack" onSubmit={handleSubmit(submit)}>
          <label>
            E-mailadres
            <input
              id="email"
              type="email"
              autoComplete="email"
              {...register("email")}
            />
            {errors.email && <span role="alert">{errors.email.message}</span>}
          </label>
          <label>
            Wachtwoord
            <input
              type="password"
              autoComplete={
                mode === "signup" ? "new-password" : "current-password"
              }
              {...register("password")}
            />
            {errors.password && (
              <span role="alert">{errors.password.message}</span>
            )}
          </label>
          {error && (
            <p role="alert" className="notice error">
              {error}
            </p>
          )}
          {message && (
            <p role="status" className="notice">
              {message}
            </p>
          )}
          <Button disabled={isSubmitting} type="submit">
            {isSubmitting
              ? "Even wachten…"
              : mode === "signup"
                ? "Account aanmaken"
                : "Inloggen"}
          </Button>
        </form>
        <Button
          variant="ghost"
          onClick={() => {
            setMode(mode === "signup" ? "login" : "signup");
            setError("");
            setMessage("");
          }}
        >
          {mode === "signup"
            ? "Al een account? Inloggen"
            : "Nieuw hier? Maak een account"}
        </Button>
        <button className="link text-sm" onClick={reset}>
          Wachtwoord vergeten
        </button>
        <p className="text-xs muted leading-5">
          Registraties zijn standaard privé. Gebruik deze app uitsluitend als je
          18 jaar of ouder bent.
        </p>
      </div>
    </div>
  );
}
