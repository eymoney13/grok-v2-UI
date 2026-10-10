import Link from "next/link";
import styles from "@/components/public/public.module.css";

export default function BeachNotFound() {
  return (
    <main className={styles.page}>
      <h1>Beach not found</h1>
      <p className={styles.lead}>That address is not a beach on the current roster.</p>
      <Link className={styles.link} href="/">
        Beaches near me
      </Link>
    </main>
  );
}
