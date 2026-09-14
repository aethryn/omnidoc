'use client'

import { IconMoon, IconSun } from '@tabler/icons-react'
import { useTheme } from './theme-provider'
import { Button } from './ui/button'

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
      className="rounded-full"
    >
      {resolvedTheme === 'dark' ? (
        <IconSun className="h-5 w-5 text-yellow-500" stroke={1.5} />
      ) : (
        <IconMoon className="h-5 w-5" stroke={1.5} />
      )}
      <span className="sr-only">Toggle theme</span>
    </Button>
  )
}
