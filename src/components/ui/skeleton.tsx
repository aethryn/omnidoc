import { Skeleton as HeroSkeleton } from "@heroui/react"
import { cn } from "@/lib/utils"

function Skeleton({ className, ...props }: React.ComponentProps<typeof HeroSkeleton>) {
  return (
    <HeroSkeleton
      data-slot="skeleton"
      className={cn(className)}
      {...props}
    />
  )
}

export { Skeleton }
