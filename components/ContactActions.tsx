'use client';

import { useState } from 'react';
import Link from 'next/link';
import { MessageCircle, MessageSquareText, Phone, Smartphone } from 'lucide-react';
import { apiPost } from '@/lib/api';
import { useToast } from '@/components/providers';
import { Button } from '@/components/ui';

interface ContactActionResult {
  ok: boolean;
  message: string;
  links: { call: string; sms: string; whatsapp: string } | null;
  contact: { name: string; phone: string; whatsapp: string } | null;
}

export function ContactActions({
  helpRequestId,
  contactUserId,
  helpReference,
  subject,
  compact,
}: {
  helpRequestId: string;
  contactUserId?: string | null;
  helpReference?: string;
  subject?: string;
  compact?: boolean;
}) {
  const { showToast } = useToast();
  const [loading, setLoading] = useState<string | null>(null);

  const openChannel = async (channel: 'call' | 'sms' | 'whatsapp') => {
    setLoading(channel);
    try {
      const result = await apiPost<ContactActionResult>(`/help-requests/${helpRequestId}/contact`, {
        channel,
        contactUserId: contactUserId || null,
        note: '',
      });
      if (result.links) {
        const url = result.links[channel];
        window.location.href = url;
        showToast({ title: channel === 'call' ? 'Opening your dialler' : `Opening ${channel === 'sms' ? 'SMS' : 'WhatsApp'}`, description: result.message, tone: 'info' });
      } else {
        showToast({ title: 'Contact link unavailable', description: result.message, tone: 'warning' });
      }
    } catch (error) {
      showToast({ title: 'Contact action could not be prepared', description: error instanceof Error ? error.message : undefined, tone: 'error' });
    } finally {
      setLoading(null);
    }
  };

  const messageHref = `/workspace/communication?compose=1${contactUserId ? `&to=${encodeURIComponent(contactUserId)}` : ''}${helpRequestId ? `&help=${encodeURIComponent(helpRequestId)}` : ''}${helpReference ? `&subject=${encodeURIComponent(`HELP ${helpReference} — ${subject || 'Follow-up'}`)}` : ''}`;

  return (
    <div className="flex flex-wrap gap-2">
      <Button size={compact ? 'sm' : 'md'} variant="outline" loading={loading === 'call'} icon={<Phone className="h-4 w-4" />} onClick={() => void openChannel('call')}>Open dialler</Button>
      <Button size={compact ? 'sm' : 'md'} variant="outline" loading={loading === 'sms'} icon={<Smartphone className="h-4 w-4" />} onClick={() => void openChannel('sms')}>Open SMS</Button>
      <Button size={compact ? 'sm' : 'md'} variant="outline" loading={loading === 'whatsapp'} icon={<MessageCircle className="h-4 w-4" />} onClick={() => void openChannel('whatsapp')}>Open WhatsApp</Button>
      <LinkButton href={messageHref} />
    </div>
  );
}

function LinkButton({ href }: { href: string }) {
  return (
    <Link href={href} className="btn border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
      <MessageSquareText className="h-4 w-4" /> In-app message
    </Link>
  );
}
