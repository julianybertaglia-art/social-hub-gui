// Shared, non-sensitive configuration for Gui Nonato's Instagram Direct CTA.
export const GUI_WHATSAPP_NUMBER = '5511923990244';
export const GUI_WHATSAPP_URL = 'https://wa.me/' + GUI_WHATSAPP_NUMBER
  + '?text=' + encodeURIComponent('Olá, vim pelo Instagram do Gui Nonato e gostaria de falar com a equipe.');
export const GUI_WHATSAPP_LABEL = 'Abrir WhatsApp';

const PHONE_NUMBER = /(?:\+?55[\s().-]*)?\(?11\)?[\s().-]*9[\s().-]*2399[\s().-]*0244\b/gi;
const WA_LINK = /https?:\/\/(?:www\.)?wa\.me\/(?:55)?11923990244(?:\?[^\s]*)?/gi;

export function upgradeGuiWhatsappNode(node) {
  if (!node || typeof node !== 'object') return node;
  const originalText = String(node.text || '');
  const hasContact = PHONE_NUMBER.test(originalText) || WA_LINK.test(originalText);
  PHONE_NUMBER.lastIndex = 0;
  WA_LINK.lastIndex = 0;

  let text = originalText;
  if (hasContact) {
    text = originalText
      .replace(WA_LINK, '')
      .replace(PHONE_NUMBER, '')
      .split('\n')
      .map((line) => {
        const cleaned = line.trim();
        // Don't leave an orphan "📲 WhatsApp:" line after removing the old number.
        if (/^(?:📲\s*)?(?:whats(?:app)?\s*:?\s*)$/i.test(cleaned)) return '';
        return line.replace(/\s+$/, '');
      })
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    // A CTA with a missing number should still read naturally.
    if (/(:|📲)$/.test(text)) text = text.replace(/[:📲\s]+$/, '').trim();
  }

  return {
    ...node,
    text,
    whatsappButton: Boolean(node.whatsappButton || hasContact),
    sharedNext: node.sharedNext ? upgradeGuiWhatsappNode(node.sharedNext) : null,
    buttons: (node.buttons || []).map((button) => ({
      ...button,
      next: button.next ? upgradeGuiWhatsappNode(button.next) : button.next,
    })),
  };
}

export function upgradeGuiWhatsappFlows(flows) {
  return (Array.isArray(flows) ? flows : []).map((flow) => ({
    ...flow,
    start: upgradeGuiWhatsappNode(flow.start),
  }));
}

export function guiWhatsappButtonTemplate(text = 'Quer falar com a equipe do Gui? Clique abaixo 👇') {
  return {
    attachment: {
      type: 'template',
      payload: {
        template_type: 'button',
        text,
        buttons: [{ type: 'web_url', title: GUI_WHATSAPP_LABEL, url: GUI_WHATSAPP_URL }],
      },
    },
  };
}
