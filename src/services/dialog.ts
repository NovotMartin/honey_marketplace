import Swal, { type SweetAlertIcon } from "sweetalert2";

type ConfirmOptions = {
  title: string;
  text: string;
  confirmText: string;
  icon?: SweetAlertIcon;
  variant?: "danger" | "success";
};

function customClass(variant: "danger" | "success" = "danger") {
  return {
    popup: "honey-dialog",
    title: "honey-dialog-title",
    htmlContainer: "honey-dialog-text",
    confirmButton: `honey-dialog-button honey-dialog-confirm honey-dialog-confirm-${variant}`,
    cancelButton: "honey-dialog-button honey-dialog-cancel",
    actions: "honey-dialog-actions"
  };
}

export async function confirmAction({ title, text, confirmText, icon = "question", variant = "success" }: ConfirmOptions) {
  const result = await Swal.fire({
    title,
    text,
    icon,
    showCancelButton: true,
    confirmButtonText: confirmText,
    cancelButtonText: "Nechat být",
    reverseButtons: true,
    focusCancel: true,
    buttonsStyling: false,
    customClass: customClass(variant)
  });

  return result.isConfirmed;
}

export function confirmDanger(options: ConfirmOptions) {
  return confirmAction({ ...options, icon: options.icon ?? "warning", variant: "danger" });
}

const infoClass = {
  popup: "honey-dialog",
  title: "honey-dialog-title",
  htmlContainer: "honey-dialog-text",
  confirmButton: "honey-dialog-button honey-dialog-confirm honey-dialog-confirm-success",
  cancelButton: "honey-dialog-cancel",
  actions: "honey-dialog-actions"
};

export async function showInfoDialog(title: string, text: string) {
  await Swal.fire({
    title,
    text,
    icon: "info",
    confirmButtonText: "Rozumím",
    buttonsStyling: false,
    customClass: infoClass
  });
}
