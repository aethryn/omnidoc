"use client"

import * as React from "react"
import Link from 'next/link'
import { IconLayoutDashboard, IconLogout } from '@tabler/icons-react'
import { useRouter, usePathname } from 'next/navigation'
import axios from "axios"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface NavItem {
  title: string
  url: string
  icon: React.ComponentType<any>
}

const navMainData: NavItem[] = [
  {
    title: "Dashboard",
    url: "/dashboard",
    icon: IconLayoutDashboard,
  },
]

const projectsData = [
  {
    name: "Event Planning",
    color: "bg-purple-500",
  },
  {
    name: "Breakfast Plan",
    color: "bg-green-500",
  },
]

export function AppSidebar({ ...props }: React.ComponentProps<'aside'>) {
  const router = useRouter()
  const pathname = usePathname()
  const [user, setUser] = React.useState<{
    name: string
    email: string
    avatar: string
    userId: string
  } | null>(null)

  React.useEffect(() => {
    const fetchUser = async () => {
      try {
        const response = await axios.get("/api/auth/user-details", {
          withCredentials: true,
        });

        if(response.data){
          setUser({
            name: response.data.name || 'User',
            email: response.data.email || 'user@mail.com',
            avatar: '',
            userId: response.data.id || ''
          });
        }
      } catch (error) {
        console.error("Error fetching userDetails: ", error);

        //fallback to default
        setUser({
          name: 'User',
          email: 'user@mail.com',
          avatar: '',
          userId: ''
        });
      }
    }
    
    fetchUser();
  }, []);

  const handleLogout = async () => {
    try {
      await axios.post('/api/auth/signout', {}, { withCredentials: true })
      window.dispatchEvent(new Event('omnidoc:signed-out'))
      router.replace('/')
    } catch (error) {
      console.error('Logout error:', error)
    }
  }

  return (
    <aside className="w-64 h-screen bg-card border-r border-border flex flex-col transition-colors" {...props}>
      {/* Logo */}
      <div className="px-6 py-5 border-b border-border flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-primary">omnidoc.</h1>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 py-6 overflow-y-auto">
        <ul className="space-y-1">
          {navMainData.map((item) => {
            const Icon = item.icon
            const isActive = pathname === item.url
            
            return (
              <li key={item.title}>
                <Button
                  variant={isActive ? "default" : "ghost"}
                  className={cn(
                    "w-full justify-start gap-3",
                    isActive ? "" : "text-foreground hover:text-foreground"
                  )}
                  asChild
                >
                  <Link href={item.url}>
                    <Icon size={20} stroke={1.5} />
                    <span className="font-medium text-sm">{item.title}</span>
                  </Link>
                </Button>
              </li>
            )
          })}
        </ul>

        {/* Projects Section */}
        <div className="mt-8">
          <div className="flex items-center justify-between px-3 mb-3">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Projects
            </h3>
            <Button variant="ghost" size="icon" className="h-6 w-6">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M8 3.33334V12.6667M3.33333 8H12.6667" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </Button>
          </div>
          <ul className="space-y-1">
            {projectsData.map((project) => (
              <li key={project.name}>
                <Button
                  variant="ghost"
                  className="w-full justify-start gap-3 text-foreground"
                  asChild
                >
                  <Link href="#">
                    <div className={`w-3 h-3 rounded-full ${project.color}`}></div>
                    <span className="text-sm">{project.name}</span>
                  </Link>
                </Button>
              </li>
            ))}
          </ul>
        </div>
      </nav>

      {/* Bottom Section */}
      <div className="border-t border-border">
        {/* User Profile */}
        {user && (
          <div className="px-4 py-4">
            <div className="flex items-center gap-3">
              <img
                src="/3d_2.png"
                alt={user.name}
                className="w-10 h-10 rounded-full"
                onError={(e) => {
                  e.currentTarget.src = ''
                }}
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{user.name}</p>
                <p className="text-xs text-muted-foreground truncate">{user.email}</p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleLogout}
                className="h-8 w-8"
                title="Logout"
              >
                <IconLogout size={18} stroke={1.5} />
              </Button>
            </div>
          </div>
        )}
      </div>
    </aside>
  )
}
