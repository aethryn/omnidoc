import Image from "next/image";
import { cn } from "@/lib/utils";

export function OmnidocLogo({ className, priority = false, alt = "Omnidoc" }: { className?:string; priority?:boolean; alt?:string }) {
  return <Image src="/omnidoc-logo.png" alt={alt} width={96} height={64} priority={priority} className={cn("object-contain",className)} />;
}
