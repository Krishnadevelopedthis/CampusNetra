import { QueryClient } from '@tanstack/react-query'

/**
 * The one QueryClient instance for the app. Lives in its own module (not
 * main.jsx) so lib/auth.js can import it to clear cached queries on
 * logout without an import cycle through main.jsx -> App.jsx -> ... ->
 * auth.js -> main.jsx.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (count, err) => (err?.status >= 400 && err?.status < 500 ? false : count < 2),
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
})
