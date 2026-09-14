"use client";
import AuthForm from "../components/AuthForm";
import { Suspense } from "react";

export default function SignUpPage() {
  return (
  <Suspense><AuthForm /></Suspense>
  );
}
