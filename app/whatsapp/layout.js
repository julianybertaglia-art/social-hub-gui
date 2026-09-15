import WhatsappModeTabs from './WhatsappModeTabs';

export default function WhatsAppLayout({ children }) {
  return (
    <>
      <WhatsappModeTabs />
      {children}
    </>
  );
}
