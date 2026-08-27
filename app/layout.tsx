import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://hyeonjang-on-3hdf.vercel.app'),
  title: '현장ON | 안전운영',
  description: '작업 전 점검, 굴착공사 관리, 긴급복구장비 현황을 한곳에서 확인하는 안전운영 서비스',
  openGraph: {
    title: '현장ON | 안전운영',
    description: '작업 전 점검, 굴착공사 관리, 긴급복구장비 현황을 한곳에서 확인합니다.',
    images: [{ url: '/hyeonjang-on-social.png', width: 1200, height: 630 }],
    locale: 'ko_KR',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: '현장ON | 안전운영',
    description: '작업 전 점검, 굴착공사 관리, 긴급복구장비 현황을 한곳에서 확인합니다.',
    images: ['/hyeonjang-on-social.png'],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
