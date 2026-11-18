import type { Metadata } from 'next';
import './globals.css';
export const metadata:Metadata={title:'Mets Jeopardy · 2026',description:'Two rounds. One final. An individual-player game for Mets Engineering.',icons:{icon:'/favicon.svg'}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>;}