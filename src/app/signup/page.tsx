import AuthForm from "../components/AuthForm";
import { Suspense } from "react";

export default function SignUpPage() {
  return (
  <Suspense fallback={null}><AuthForm mode="signup" /></Suspense>
  );
}
