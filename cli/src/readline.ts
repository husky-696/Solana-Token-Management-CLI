import * as readline from 'readline';

// Create a readline interface
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// Promisified question function
export function question(query: string): Promise<string> {
    return new Promise((resolve) => {
        rl.question(query, (answer) => {
            resolve(answer);
        });
    });
}

// Function to close the readline interface
export function closeReadline() {
    rl.close();
}

// Function to handle the "press enter to continue" prompt
export async function pressEnterToContinue(): Promise<void> {
    await question('\nPress Enter to continue...');
}
