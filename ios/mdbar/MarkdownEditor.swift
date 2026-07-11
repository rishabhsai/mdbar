import SwiftUI
import UIKit

struct MarkdownEditor: UIViewRepresentable {
    @Binding var text: String
    var placeholder: String
    var minHeight: CGFloat = 220

    func makeCoordinator() -> Coordinator {
        Coordinator(text: $text)
    }

    func makeUIView(context: Context) -> UITextView {
        let view = UITextView()
        view.delegate = context.coordinator
        view.backgroundColor = .clear
        view.textColor = UIColor(MDTheme.ink)
        view.tintColor = UIColor(MDTheme.accent)
        view.font = .preferredFont(forTextStyle: .body)
        view.adjustsFontForContentSizeCategory = true
        view.textContainerInset = UIEdgeInsets(top: 8, left: 0, bottom: 24, right: 0)
        view.textContainer.lineFragmentPadding = 0
        view.keyboardDismissMode = .interactive
        view.accessibilityLabel = placeholder
        view.inputAccessoryView = context.coordinator.makeToolbar()
        view.setContentHuggingPriority(.defaultLow, for: .horizontal)
        return view
    }

    func updateUIView(_ view: UITextView, context: Context) {
        if view.text != text {
            let selection = view.selectedRange
            view.text = text
            view.selectedRange = NSRange(
                location: min(selection.location, (text as NSString).length),
                length: 0
            )
        }
        view.invalidateIntrinsicContentSize()
    }

    func sizeThatFits(_ proposal: ProposedViewSize, uiView: UITextView, context: Context) -> CGSize? {
        let width = proposal.width ?? 320
        let measured = uiView.sizeThatFits(CGSize(width: width, height: .greatestFiniteMagnitude))
        return CGSize(width: width, height: max(minHeight, measured.height))
    }

    final class Coordinator: NSObject, UITextViewDelegate {
        @Binding private var text: String
        private weak var textView: UITextView?

        init(text: Binding<String>) {
            _text = text
        }

        func textViewDidBeginEditing(_ textView: UITextView) {
            self.textView = textView
        }

        func textViewDidChange(_ textView: UITextView) {
            text = textView.text
        }

        func makeToolbar() -> UIToolbar {
            let toolbar = UIToolbar()
            toolbar.barStyle = .black
            toolbar.isTranslucent = false
            toolbar.tintColor = UIColor(MDTheme.ink)
            toolbar.barTintColor = UIColor(MDTheme.surface)

            let commands: [(String, String, Int)] = [
                ("checklist", "Checklist", 1),
                ("textformat.size", "Heading", 2),
                ("bold", "Bold", 3),
                ("italic", "Italic", 4),
                ("link", "Link", 5),
                ("chevron.left.forwardslash.chevron.right", "Code", 6),
                ("text.quote", "Quote", 7),
                ("list.bullet", "List", 8)
            ]
            var items = commands.map { icon, label, tag in
                let item = UIBarButtonItem(
                    image: UIImage(systemName: icon),
                    style: .plain,
                    target: self,
                    action: #selector(applyCommand(_:))
                )
                item.tag = tag
                item.accessibilityLabel = label
                return item
            }
            items.append(.flexibleSpace())
            let dismiss = UIBarButtonItem(
                image: UIImage(systemName: "keyboard.chevron.compact.down"),
                style: .plain,
                target: self,
                action: #selector(dismissKeyboard)
            )
            dismiss.accessibilityLabel = "Dismiss keyboard"
            items.append(dismiss)
            toolbar.items = items
            toolbar.sizeToFit()
            return toolbar
        }

        @objc private func applyCommand(_ sender: UIBarButtonItem) {
            guard let view = textView else { return }
            switch sender.tag {
            case 1: insert("- [ ] ", in: view)
            case 2: insert("## ", in: view)
            case 3: wrap("**", in: view)
            case 4: wrap("_", in: view)
            case 5: wrap("[", suffix: "](https://)", in: view)
            case 6: wrap("`", in: view)
            case 7: insert("> ", in: view)
            case 8: insert("- ", in: view)
            default: break
            }
        }

        private func insert(_ value: String, in view: UITextView) {
            if let range = view.selectedTextRange {
                view.replace(range, withText: value)
            } else {
                view.insertText(value)
            }
            text = view.text
        }

        private func wrap(_ prefix: String, suffix: String? = nil, in view: UITextView) {
            let nsText = view.text as NSString
            let range = view.selectedRange
            let selected = range.length > 0 ? nsText.substring(with: range) : ""
            let replacement = prefix + selected + (suffix ?? prefix)
            view.replaceCharacters(in: range, with: replacement)
            let cursor = range.location + prefix.count + selected.count
            view.selectedRange = NSRange(location: cursor, length: 0)
            text = view.text
        }

        @objc private func dismissKeyboard() {
            textView?.resignFirstResponder()
        }
    }
}

private extension UITextView {
    func replaceCharacters(in range: NSRange, with replacement: String) {
        let mutable = NSMutableString(string: text)
        mutable.replaceCharacters(in: range, with: replacement)
        text = mutable as String
    }
}
