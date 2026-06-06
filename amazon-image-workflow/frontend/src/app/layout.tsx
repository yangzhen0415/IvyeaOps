import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Amazon Image Generation Workflow',
  description: 'AI-powered Amazon product image generation tool',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh">
      <head>
        <script dangerouslySetInnerHTML={{ __html: `
          // Sync theme from parent ops-hub
          try {
            var t = window.parent.document.documentElement.getAttribute('data-theme');
            if (t === 'light') {
              document.documentElement.style.setProperty('--bg','#f5f5f3');
              document.documentElement.style.setProperty('--bg1','#fff');
              document.documentElement.style.setProperty('--bg2','#efefed');
              document.documentElement.style.setProperty('--bg3','#e8e8e6');
              document.documentElement.style.setProperty('--b','#e0e0de');
              document.documentElement.style.setProperty('--t','#111');
              document.documentElement.style.setProperty('--t2','#555');
              document.documentElement.style.setProperty('--t3','#999');
              document.documentElement.style.setProperty('--acc','#16a34a');
            }
          } catch(e){}
        `}} />
      </head>
      <body>
        <main style={{padding:'12px 16px'}}>{children}</main>
      </body>
    </html>
  );
}
