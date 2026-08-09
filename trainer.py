#!/usr/bin/env python3
"""
MORSE ACADEMY — Terminal Trainer
=================================
A zero-dependency, pure-stdlib companion to the web app in this repo,
for anyone who'd rather drill Morse code without leaving a terminal.

Same Koch-method philosophy as the web trainer: characters are always
shown at full target speed, only the pacing between reps is up to you.
No audio library required — timing is conveyed visually (a flashing
block synced to real dit/dah durations) plus an optional terminal bell.

Run:
    python3 cli/trainer.py
    python3 cli/trainer.py --selftest   # non-interactive smoke test
"""
import argparse
import random
import sys
import time

# ---------------------------------------------------------------------
# Data — kept in sync by hand with data.js's MORSE_MAP / KOCH_ORDER.
# ---------------------------------------------------------------------
MORSE_MAP = {
    "A": ".-", "B": "-...", "C": "-.-.", "D": "-..", "E": ".", "F": "..-.",
    "G": "--.", "H": "....", "I": "..", "J": ".---", "K": "-.-", "L": ".-..",
    "M": "--", "N": "-.", "O": "---", "P": ".--.", "Q": "--.-", "R": ".-.",
    "S": "...", "T": "-", "U": "..-", "V": "...-", "W": ".--", "X": "-..-",
    "Y": "-.--", "Z": "--..",
    "0": "-----", "1": ".----", "2": "..---", "3": "...--", "4": "....-",
    "5": ".....", "6": "-....", "7": "--...", "8": "---..", "9": "----.",
    ".": ".-.-.-", ",": "--..--", "?": "..--..", "'": ".----.", "!": "-.-.--",
    "/": "-..-.", "(": "-.--.", ")": "-.--.-", "&": ".-...", ":": "---...",
    ";": "-.-.-.", "=": "-...-", "+": ".-.-.", "-": "-....-", "_": "..--.-",
    '"': ".-..-.", "$": "...-..-", "@": ".--.-.",
}
REVERSE_MAP = {v: k for k, v in MORSE_MAP.items()}

KOCH_ORDER = list("KMRSUAPTLOWINJEFYVGQZHBXCD") + \
    ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0", ".", ",", "?", "/"]

BELL = "\a"


def compute_mirror_pairs():
    """Letters whose code is the exact reverse of another's — computed,
    not memorized, so it can never drift from MORSE_MAP."""
    seen = set()
    pairs = []
    for ch, code in MORSE_MAP.items():
        if not (len(ch) == 1 and ch.isalpha()):
            continue
        rev = code[::-1]
        partner = REVERSE_MAP.get(rev)
        if partner and partner != ch and partner.isalpha() and ch not in seen and partner not in seen:
            pairs.append((ch, code, partner, rev))
            seen.add(ch)
            seen.add(partner)
    return pairs


def flash(code, wpm, use_bell=True):
    """Visually (and optionally audibly, via terminal bell) render one
    character's dit/dah pattern in real time at the given WPM."""
    unit = 1.2 / wpm  # seconds per dit; matches 1200/wpm ms used in the web app
    for i, sym in enumerate(code):
        dur = unit if sym == "." else unit * 3
        block = "█" if sym == "." else "████████"
        sys.stdout.write(block)
        if use_bell:
            sys.stdout.write(BELL)
        sys.stdout.flush()
        time.sleep(dur)
        sys.stdout.write("\r" + " " * 20 + "\r")
        sys.stdout.flush()
        if i < len(code) - 1:
            time.sleep(unit)
    time.sleep(unit * 2)


def copy_drill(chars, wpm, reps, use_bell=True):
    correct = 0
    for i in range(reps):
        ch = random.choice(chars)
        print(f"\n[{i + 1}/{reps}] Watch the flash…")
        flash(MORSE_MAP[ch], wpm, use_bell)
        try:
            guess = input("What character was that? ").strip().upper()
        except EOFError:
            guess = ""
        ok = guess == ch
        correct += int(ok)
        print("Correct!" if ok else f"Nope — it was '{ch}'  ({MORSE_MAP[ch]})")
    pct = round(100 * correct / reps) if reps else 0
    print(f"\nSession complete: {correct}/{reps} correct ({pct}%)")


def print_reference():
    print("\n--- Koch Training Set (teaching order) ---")
    for j in range(0, len(KOCH_ORDER), 8):
        row = KOCH_ORDER[j:j + 8]
        print("  " + "   ".join(f"{c}:{MORSE_MAP[c]}" for c in row))

    print("\n--- Mirror Pairs (reverse the rhythm, get the partner) ---")
    for a, ca, b, cb in compute_mirror_pairs():
        print(f"  {a} {ca:<6}  <-->  {b} {cb:<6}")

    print("\n--- Number Pattern Logic ---")
    print("  1-5 : number of dots = the digit; dashes fill out 5 elements")
    print("        1=.----  2=..---  3=...--  4=....-  5=.....")
    print("  6-0 : number of dashes = digit-5 (0 counts as 10); dots fill the rest")
    print("        6=-....  7=--...  8=---..  9=----.  0=-----")


def selftest():
    """Non-interactive smoke test: proves the data tables and core
    functions are internally consistent without needing a TTY."""
    random.seed(42)
    assert len(KOCH_ORDER) == 40, f"expected 40 Koch characters, got {len(KOCH_ORDER)}"
    assert all(c in MORSE_MAP for c in KOCH_ORDER), "a Koch character is missing from MORSE_MAP"
    pairs = compute_mirror_pairs()
    assert len(pairs) == 6, f"expected 6 mirror pairs, got {len(pairs)}"
    expected_partners = {"A": "N", "B": "V", "D": "U", "F": "L", "G": "W", "Q": "Y"}
    got = {a: b for a, _, b, _ in pairs}
    assert got == expected_partners, f"mirror pairs mismatch: {got}"
    print_reference()
    print("\n[selftest] tables OK, mirror pairs OK (6/6 match expected)")
    print("[selftest] PASSED")


def main():
    parser = argparse.ArgumentParser(description="Morse Academy CLI Trainer")
    parser.add_argument("--selftest", action="store_true", help="run a non-interactive smoke test and exit")
    parser.add_argument("--no-bell", action="store_true", help="disable the terminal bell click during flashes")
    args = parser.parse_args()

    if args.selftest:
        selftest()
        return

    print("=" * 46)
    print("   MORSE ACADEMY — Terminal Trainer")
    print("=" * 46)
    print("Same Koch-method curriculum as the web app, no browser required.\n")

    settings = {"n": 12, "wpm": 20}

    def configure():
        try:
            raw = input(f"How many Koch characters to drill? [{settings['n']}]: ").strip()
            settings["n"] = max(2, min(len(KOCH_ORDER), int(raw))) if raw else settings["n"]
        except ValueError:
            pass
        try:
            raw = input(f"Character speed in WPM? [{settings['wpm']}]: ").strip()
            settings["wpm"] = max(5, min(40, int(raw))) if raw else settings["wpm"]
        except ValueError:
            pass

    configure()

    while True:
        chars = KOCH_ORDER[:settings["n"]]
        print(f"\n[{settings['n']} chars unlocked · {settings['wpm']} WPM]")
        print("1) Copy Drill   2) Reference Chart   3) Change Settings   4) Quit")
        try:
            choice = input("> ").strip()
        except EOFError:
            choice = "4"

        if choice == "1":
            try:
                raw = input("How many reps? [10]: ").strip()
                reps = int(raw) if raw else 10
            except ValueError:
                reps = 10
            copy_drill(chars, settings["wpm"], max(1, reps), use_bell=not args.no_bell)
        elif choice == "2":
            print_reference()
        elif choice == "3":
            configure()
        elif choice == "4":
            print("73! Good copy.")
            break
        else:
            print("Not a valid choice — pick 1, 2, 3, or 4.")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n73! (interrupted)")
        sys.exit(0)
