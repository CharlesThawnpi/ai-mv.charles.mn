// Root layout — minimal shell; locale layout in app/[locale]/layout.tsx handles everything
export const metadata = {
  title: 'AI Movie & Series Recommender',
  description: 'Your personal smart recommendation engine',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return children;
}
