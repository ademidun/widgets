export default (style)=>{
  return(`

    .ReactDialogBackground {
      backdrop-filter: blur(5px);
      background: rgba(0,0,0,0.7);
    }

    .contained .ReactDialog {
      position: absolute;
      height: 100%;
      min-height: 100%;
      width: 100%;
      min-width: 100%;
    }

    .contained .ReactDialogBackground {
      position: absolute;
    }

    .contained .ReactDialog.ReactDialogOpen .ReactDialogAnimation {
      top: 0;
    }

    .Dialog {
      margin: 0 auto;
      position: relative;
      width: 420px;
      box-shadow: 0 0 20px rgba(0,0,0,0.1);
      border-radius: 13px;
      background: rgb(248,248,248);
    }

    @media (max-width: 450px) {

      .Dialog {
        border-radius: 0;
        width: 100%;
      }
    }

    @media (orientation: portrait) and (max-width: 800px) {

      .ReactDialogAnimation {
        width: 100%;
      }

      .ReactDialog {
        height: 100%;
        min-height: 100%;
      }

      .ReactDialogStack {
        align-items: flex-end;
      }

      .Dialog {
        align-content: stretch;
        border-radius: 13px;
        border-top-radius: 13px;
        display: flex;
        flex-direction: column;
      }

      .DialogBody {
        flex: 1;
        align-items: flex-end;
      }

      .DialogFooter {
        padding-bottom: 20px;
      }

      .ReactDialogAnimation {
        margin-bottom: -100px !important;
        top: inherit !important;
        position: relative;
        transition: opacity 0.4s ease, margin-bottom 0.4s ease;
      }

      .ReactDialog.ReactDialogOpen .ReactDialogAnimation {
        margin-bottom: 0px !important;
      }

      .DialogFooter {
        border-bottom-left-radius: 0 !important;
        border-bottom-right-radius: 0 !important;
      }

      .ReactShadowDOMInsideContainer > .ReactDialog {
        align-items: flex-end;
      }
    }

    .DialogBody {
      overflow-x: hidden;
      overflow-y: auto;
    }

    .DialogBody.ScrollHeight {
      height: 30vh !important;
      max-height: 30vh !important;
    }

    .DialogHeader {
      border-top-left-radius: 13px;
      border-top-right-radius: 13px;
      min-height: 54px;
      position: relative;
      width: 100%;
    }

    .DialogHeaderActionRight {
      position: absolute;
      top: 0;
      right: 0;
      height: 48px;
    }

    .DialogHeaderActionLeft {
      position: absolute;
      top: 0;
      left: 0;
      height: 48px;
    }

    .DialogFooter {
      border-bottom-left-radius: 13px;
      border-bottom-right-radius: 13px;
      line-height: 24px;
      min-height: 32px;
      position: relative;
      text-align: center;
    }

  `)
}
