import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'C-Section Beam Designer',
  description:
    'Design of cold-formed lipped C-section beam systems for storage and racking mezzanines: main beams, secondaries, connections, box columns, restraints, with traceable checks and a printable report.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
