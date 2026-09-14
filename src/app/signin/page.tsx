"use client";
import { Suspense } from "react";
import AuthForm from "../components/AuthForm"; 

export default function SignInPage() {
  return (
    <Suspense><AuthForm /></Suspense>
    );
}
