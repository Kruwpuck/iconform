'use client';

import { useEffect, useState } from 'react';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';

/**
 * Collapsible frame around the sidebar. Sidebar itself stays a server component
 * (it calls auth() and hosts the signOut server action), so the collapsed state
 * lives here and its children hide themselves via `group-data-[collapsed]/sb:`.
 */
export default function SidebarShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);

  // ponytail: read after mount — a cookie would avoid the one-frame flash on
  // reload, but that means plumbing it through the server layout
  useEffect(() => setCollapsed(localStorage.getItem('sidebarCollapsed') === '1'), []);

  function toggle() {
    setCollapsed((c) => {
      localStorage.setItem('sidebarCollapsed', c ? '0' : '1');
      return !c;
    });
  }

  return (
    <aside
      data-collapsed={collapsed || undefined}
      className="group/sb bg-blue-950 text-white flex-shrink-0 flex flex-col min-h-screen
                 w-64 p-4 data-[collapsed]:w-16 data-[collapsed]:p-2
                 transition-[width,padding] duration-200"
    >
      <button
        type="button"
        onClick={toggle}
        aria-label={collapsed ? 'Perlebar menu' : 'Ciutkan menu'}
        title={collapsed ? 'Perlebar menu' : 'Ciutkan menu'}
        className="self-end p-1.5 rounded text-white/70 hover:bg-blue-800 hover:text-white transition-colors"
      >
        {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
      </button>
      {children}
    </aside>
  );
}
