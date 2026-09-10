import * as Y from 'yjs'

type Disposable = { dispose: () => void }

export class MonacoYjsBinding {
  private static activeBindings = new WeakMap<object, MonacoYjsBinding>()
  private applyingRemote = false
  private applyingLocal = false
  private destroyed = false
  private decorations = new Map<any, string[]>()
  private disposables: Disposable[] = []
  private awareness: any

  constructor(
    private monaco: any,
    private ytext: Y.Text,
    private monacoModel: any,
    private editors: Set<any>,
    awareness: any = null
  ) {
    // A Monaco model can only be driven by one Y.Text. Without this guard, a
    // second binding treats the first binding's remote edits as local edits and
    // sends them back to Yjs, which can amplify the document on every sync.
    MonacoYjsBinding.activeBindings.get(this.monacoModel)?.destroy()
    MonacoYjsBinding.activeBindings.set(this.monacoModel, this)

    this.awareness = awareness
    this.ytext.observe(this.handleYText)

    const current = this.ytext.toString()
    if (this.monacoModel.getValue() !== current) this.monacoModel.setValue(current)

    this.disposables.push(
      this.monacoModel.onDidChangeContent((event: any) => {
        if (this.applyingRemote) return
        this.applyingLocal = true
        try {
          this.ytext.doc?.transact(() => {
            event.changes
              .slice()
              .sort((a: any, b: any) => b.rangeOffset - a.rangeOffset)
              .forEach((change: any) => {
                this.ytext.delete(change.rangeOffset, change.rangeLength)
                this.ytext.insert(change.rangeOffset, change.text)
              })
          }, this)
        } finally {
          this.applyingLocal = false
        }
      }),
      this.monacoModel.onWillDispose(() => this.destroy())
    )

    if (this.awareness) {
      this.editors.forEach((editor) => {
        this.disposables.push(
          editor.onDidChangeCursorSelection(() => {
            if (editor.getModel() !== this.monacoModel) return
            const selection = editor.getSelection()
            if (!selection) return

            let anchor = this.monacoModel.getOffsetAt(selection.getStartPosition())
            let head = this.monacoModel.getOffsetAt(selection.getEndPosition())
            if (selection.getDirection() === this.monaco.SelectionDirection.RTL) {
              const previousAnchor = anchor
              anchor = head
              head = previousAnchor
            }

            this.awareness.setLocalStateField('selection', {
              anchor: Y.createRelativePositionFromTypeIndex(this.ytext, anchor),
              head: Y.createRelativePositionFromTypeIndex(this.ytext, head),
            })
          })
        )
      })
      this.awareness.on('change', this.renderRemoteSelections)
    }
  }

  private handleYText = (event: Y.YTextEvent) => {
    if (this.applyingLocal) return
    this.applyingRemote = true
    try {
      let index = 0
      event.delta.forEach((op) => {
        if (op.retain !== undefined) {
          index += op.retain
          return
        }

        if (op.insert !== undefined) {
          const position = this.monacoModel.getPositionAt(index)
          const range = new this.monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column)
          const text = String(op.insert)
          this.monacoModel.applyEdits([{ range, text }])
          index += text.length
          return
        }

        if (op.delete !== undefined) {
          const start = this.monacoModel.getPositionAt(index)
          const end = this.monacoModel.getPositionAt(index + op.delete)
          const range = new this.monaco.Range(start.lineNumber, start.column, end.lineNumber, end.column)
          this.monacoModel.applyEdits([{ range, text: '' }])
        }
      })
    } finally {
      this.applyingRemote = false
    }
    this.renderRemoteSelections()
  }

  private renderRemoteSelections = () => {
    if (!this.awareness) return

    this.editors.forEach((editor) => {
      if (editor.getModel() !== this.monacoModel) return
      const currentDecorations = this.decorations.get(editor) || []
      const nextDecorations: any[] = []

      this.awareness.getStates().forEach((state: any, clientId: number) => {
        if (clientId === this.ytext.doc?.clientID || !state.selection?.anchor || !state.selection?.head) return
        const anchor = Y.createAbsolutePositionFromRelativePosition(state.selection.anchor, this.ytext.doc!)
        const head = Y.createAbsolutePositionFromRelativePosition(state.selection.head, this.ytext.doc!)
        if (!anchor || !head || anchor.type !== this.ytext || head.type !== this.ytext) return

        const startIndex = Math.min(anchor.index, head.index)
        const endIndex = Math.max(anchor.index, head.index)
        const start = this.monacoModel.getPositionAt(startIndex)
        const end = this.monacoModel.getPositionAt(endIndex)
        nextDecorations.push({
          range: new this.monaco.Range(start.lineNumber, start.column, end.lineNumber, end.column),
          options: {
            className: `yRemoteSelection yRemoteSelection-${clientId}`,
            afterContentClassName: anchor.index <= head.index ? `yRemoteSelectionHead yRemoteSelectionHead-${clientId}` : null,
            beforeContentClassName: anchor.index > head.index ? `yRemoteSelectionHead yRemoteSelectionHead-${clientId}` : null,
          },
        })
      })

      this.decorations.set(editor, editor.deltaDecorations(currentDecorations, nextDecorations))
    })
  }

  destroy() {
    if (this.destroyed) return
    this.destroyed = true

    this.ytext.unobserve(this.handleYText)
    if (this.awareness) this.awareness.off('change', this.renderRemoteSelections)
    this.disposables.forEach((disposable) => disposable.dispose())
    this.editors.forEach((editor) => {
      const currentDecorations = this.decorations.get(editor) || []
      if (currentDecorations.length) editor.deltaDecorations(currentDecorations, [])
    })
    this.decorations.clear()
    if (MonacoYjsBinding.activeBindings.get(this.monacoModel) === this) {
      MonacoYjsBinding.activeBindings.delete(this.monacoModel)
    }
  }
}
