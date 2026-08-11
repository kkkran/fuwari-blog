export function emitSuccessToast(
	title: string,
	description: string,
	silent = true,
): void {
	if (!silent) {
		alert(`${title}\n\n${description}`);
	}
}

export function emitErrorToast(title: string, description: string): void {
	alert(`${title}\n\n${description}`);
}

// Alias for emitSuccessToast for backward compatibility
export const emitInfoToast: typeof emitSuccessToast = emitSuccessToast;

// Alias for emitErrorToast for backward compatibility
export const emitWarningToast: typeof emitErrorToast = emitErrorToast;
