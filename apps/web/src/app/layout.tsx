import '@model-monitor/ui/tokens.css';
import './styles.css';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Model Monitor', description: 'Private model registry and subscription monitor' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
