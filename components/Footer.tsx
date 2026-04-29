export default function Footer() {
  return (
    <footer
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.4rem',
        padding: '1.5rem 1rem 1rem',
        marginTop: '2rem',
        borderTop: '1px solid #e5e7eb',
        fontSize: '0.7rem',
        color: '#9ca3af',
      }}
    >
      <span>Powered by</span>
      <img
        src="/oj-logo.png"
        alt="OuterJoin"
        style={{ height: 48, objectFit: 'contain', opacity: 0.7 }}
      />
    </footer>
  );
}
