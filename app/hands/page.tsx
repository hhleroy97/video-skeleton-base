import { redirect } from 'next/navigation';

export default function HandsPageRedirect() {
  // `/hands` is no longer the base route; keep as a convenience redirect.
  redirect('/');
}
