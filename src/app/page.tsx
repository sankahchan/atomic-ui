import { redirect } from 'next/navigation';

/**
 * Root Page
 * 
 * This is the landing page for Atomic-UI. It simply redirects visitors
 * to the login page. The actual dashboard content is protected and
 * requires authentication.
 * 
 * The redirect happens server-side for optimal performance and SEO.
 */
export default function Home() {
  // Redirect to login page
  // The login page will redirect to dashboard if already authenticated
  redirect('/login');
}
