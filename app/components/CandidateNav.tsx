type CandidateNavProps = {
  active: 'control' | 'digsafe' | 'recover';
  compact?: boolean;
};

const candidates = [
  { key: 'control', label: '종합현황', href: '/' },
  { key: 'digsafe', label: '굴착공사 관리', href: '/digsafe' },
  { key: 'recover', label: '긴급복구장비', href: '/recover' },
] as const;

export default function CandidateNav({ active, compact = false }: CandidateNavProps) {
  return (
    <nav className={compact ? 'candidate-nav compact-candidate-nav' : 'candidate-nav'} aria-label="업무 메뉴">
      {candidates.map((candidate) => (
        <a key={candidate.key} className={active === candidate.key ? 'active-candidate' : ''} href={candidate.href}>
          {candidate.label}
        </a>
      ))}
    </nav>
  );
}
