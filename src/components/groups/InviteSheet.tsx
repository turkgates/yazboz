import { useRouter } from '@tanstack/react-router'
import { EntrySheet } from '@/components/game/RoundEntryParts'
import { ShareCodeBlock } from '@/components/ShareCodeBlock'
import type { Group } from '@/types'

export function InviteSheet({ group, onClose }: { group: Group; onClose: () => void }) {
  const router = useRouter()

  // Arama değeri router'dan geçer: "234567" gibi kodlar sayı sanılmasın diye tırnaklanır
  const inviteLink =
    window.location.origin +
    router.buildLocation({ to: '/join-group', search: { code: group.invite_code } }).href

  return (
    <EntrySheet title="Gruba Davet Et" onClose={onClose}>
      <ShareCodeBlock
        code={group.invite_code}
        link={inviteLink}
        note="QR kodu okutabilir veya davet kodunu paylaşabilirsin."
        shareTitle={`${group.name} grubu`}
        shareText={`Okeyif'te ${group.name} grubuna katıl. Davet kodu: ${group.invite_code}`}
      />
    </EntrySheet>
  )
}
