// This script will be run within the webview itself
import { randomName } from '../common/names';
import {
    PetSize,
    PetColor,
    PetType,
    Theme,
    ColorThemeKind,
    WebviewMessage,
} from '../common/types';
import {
    createPet,
    IPetType,
    PetCollection,
    PetElement,
    IPetCollection,
} from './pets';
import { BallState, PetElementState, PetPanelState } from './states';

/* This is how the VS Code API can be invoked from the panel */
declare global {
    interface VscodeStateApi {
        getState(): PetPanelState | undefined; // API is actually Any, but we want it to be typed.
        setState(state: PetPanelState): void;
        postMessage(message: WebviewMessage): void;
    }
    interface Window {
        acquireVsCodeApi(): VscodeStateApi;
    }
}

export var allPets: IPetCollection = new PetCollection();
var petCounter: number;

function calculateBallRadius(size: PetSize): number {
    if (size === PetSize.nano) {
        return 2;
    } else if (size === PetSize.medium) {
        return 4;
    } else if (size === PetSize.large) {
        return 8;
    } else {
        return 1; // Shrug
    }
}

function calculateFloor(size: PetSize, theme: Theme): number {
    switch (theme) {
        case Theme.forest:
            switch (size) {
                case PetSize.medium:
                    return 40;
                case PetSize.large:
                    return 65;
                case PetSize.nano:
                default:
                    return 23;
            }
        case Theme.castle:
            switch (size) {
                case PetSize.medium:
                    return 80;
                case PetSize.large:
                    return 120;
                case PetSize.nano:
                default:
                    return 45;
            }
        case Theme.beach:
            switch (size) {
                case PetSize.medium:
                    return 80;
                case PetSize.large:
                    return 120;
                case PetSize.nano:
                default:
                    return 45;
            }
    }
    return 0;
}

function handleMouseOver(e: MouseEvent) {
    var el = e.currentTarget as HTMLDivElement;
    allPets.pets().forEach((element) => {
        if (element.collision === el) {
            if (!element.pet.canSwipe()) {
                return;
            }
            element.pet.swipe();
        }
    });
}

function startAnimations(
    collision: HTMLDivElement,
    pet: IPetType,
    stateApi?: VscodeStateApi,
) {
    if (!stateApi) {
        stateApi = window.acquireVsCodeApi();
    }

    collision.addEventListener('mouseover', handleMouseOver);
    setInterval(() => {
        var updates = allPets.seekNewFriends();
        updates.forEach((message) => {
            stateApi?.postMessage({
                text: message,
                command: 'info',
            });
        });
        pet.nextFrame();
        saveState(stateApi);
    }, 100);
}

function addPetToPanel(
    petType: PetType,
    basePetUri: string,
    displayNameTag: boolean,
    petColor: PetColor,
    petSize: PetSize,
    left: number,
    bottom: number,
    floor: number,
    name: string,
    stateApi?: VscodeStateApi,
): PetElement {
    var petSpriteElement: HTMLImageElement = document.createElement('img');
    petSpriteElement.className = 'pet';
    (document.getElementById('petsContainer') as HTMLDivElement).appendChild(
        petSpriteElement,
    );

    var collisionElement: HTMLDivElement = document.createElement('div');
    collisionElement.className = 'collision';
    (document.getElementById('petsContainer') as HTMLDivElement).appendChild(
        collisionElement,
    );

    var speechBubbleElement: HTMLDivElement = document.createElement('div');
    speechBubbleElement.className = `bubble bubble-${petSize}`;
    speechBubbleElement.innerText = 'Hello!';
    (document.getElementById('petsContainer') as HTMLDivElement).appendChild(
        speechBubbleElement,
    );

    var nameTagElement: HTMLDivElement = document.createElement('div');
    nameTagElement.className = `name-tag name-tag-${petSize}`;
    (document.getElementById('petsContainer') as HTMLDivElement).appendChild(
        nameTagElement,
    );

    const root = basePetUri + '/' + petType + '/' + petColor;
    console.log('Creating new pet : ', petType, root, petColor, petSize, name);
    try {
        var newPet = createPet(
            petType,
            petSpriteElement,
            collisionElement,
            speechBubbleElement,
            nameTagElement,
            displayNameTag,
            petSize,
            left,
            bottom,
            root,
            floor,
            name,
        );
        petCounter++;
        startAnimations(collisionElement, newPet, stateApi);
    } catch (e: any) {
        // Remove elements
        petSpriteElement.remove();
        collisionElement.remove();
        speechBubbleElement.remove();
        nameTagElement.remove();
        throw e;
    }

    return new PetElement(
        petSpriteElement,
        collisionElement,
        speechBubbleElement,
        nameTagElement,
        newPet,
        petColor,
        petType,
    );
}

export function saveState(stateApi?: VscodeStateApi) {
    if (!stateApi) {
        stateApi = window.acquireVsCodeApi();
    }
    var state = new PetPanelState();
    state.petStates = new Array();

    allPets.pets().forEach((petItem) => {
        state.petStates?.push({
            petName: petItem.pet.name(),
            petColor: petItem.color,
            petType: petItem.type,
            petState: petItem.pet.getState(),
            petFriend: petItem.pet.friend()?.name() ?? undefined,
            elLeft: petItem.el.style.left,
            elBottom: petItem.el.style.bottom,
        });
    });
    state.petCounter = petCounter;
    stateApi.setState(state);
}

function recoverState(
    basePetUri: string,
    displayNameTag: boolean,
    petSize: PetSize,
    floor: number,
    stateApi?: VscodeStateApi,
) {
    if (!stateApi) {
        stateApi = window.acquireVsCodeApi();
    }
    var state = stateApi.getState();
    if (!state) {
        petCounter = 1;
    } else {
        if (state.petCounter === undefined || isNaN(state.petCounter)) {
            petCounter = 1;
        } else {
            petCounter = state.petCounter ?? 1;
        }
    }

    var recoveryMap: Map<IPetType, PetElementState> = new Map();
    state?.petStates?.forEach((p) => {
        // Fixes a bug related to duck animations
        if ((p.petType as string) === 'rubber duck') {
            (p.petType as string) = 'rubber-duck';
        }

        try {
            var newPet = addPetToPanel(
                p.petType ?? PetType.cat,
                basePetUri,
                displayNameTag,
                p.petColor ?? PetColor.brown,
                petSize,
                parseInt(p.elLeft ?? '0'),
                parseInt(p.elBottom ?? '0'),
                floor,
                p.petName ?? randomName(p.petType ?? PetType.cat),
                stateApi,
            );
            allPets.push(newPet);
            recoveryMap.set(newPet.pet, p);
        } catch (InvalidPetException) {
            console.log(
                'State had invalid pet (' + p.petType + '), discarding.',
            );
        }
    });
    recoveryMap.forEach((state, pet) => {
        // Recover previous state.
        if (state.petState !== undefined) {
            pet.recoverState(state.petState);
        }

        // Resolve friend relationships
        var friend = undefined;
        if (state.petFriend) {
            friend = allPets.locate(state.petFriend);
            if (friend) {
                pet.recoverFriend(friend.pet);
            }
        }
    });
}

function randomStartPosition(): number {
    return Math.floor(Math.random() * (window.innerWidth * 0.7));
}

let canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D;

function initCanvas() {
    canvas = document.getElementById('petCanvas') as HTMLCanvasElement;
    if (!canvas) {
        console.log('Canvas not ready');
        return;
    }
    ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
    if (!ctx) {
        console.log('Canvas context not ready');
        return;
    }
    ctx.canvas.width = window.innerWidth;
    ctx.canvas.height = window.innerHeight;
}

// It cannot access the main VS Code APIs directly.
export function petPanelApp(
    basePetUri: string,
    theme: Theme,
    themeKind: ColorThemeKind,
    displayNameTag: boolean,
    petColor: PetColor,
    petSize: PetSize,
    petType: PetType,
    stateApi?: VscodeStateApi,
) {
    const ballRadius: number = calculateBallRadius(petSize);
    var floor = 0;
    if (!stateApi) {
        stateApi = window.acquireVsCodeApi();
    }
    // Apply Theme backgrounds
    const foregroundEl = document.getElementById('foreground');
    if (theme !== Theme.none) {
        var _themeKind = '';
        switch (themeKind) {
            case ColorThemeKind.dark:
                _themeKind = 'dark';
                break;
            case ColorThemeKind.light:
                _themeKind = 'light';
                break;
            case ColorThemeKind.highContrast:
            default:
                _themeKind = 'light';
                break;
        }

        document.body.style.backgroundImage = `url('${basePetUri}/backgrounds/${theme}/background-${_themeKind}-${petSize}.png')`;
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        foregroundEl!.style.backgroundImage = `url('${basePetUri}/backgrounds/${theme}/foreground-${_themeKind}-${petSize}.png')`;

        floor = calculateFloor(petSize, theme); // Themes have pets at a specified height from the ground
    } else {
        document.body.style.backgroundImage = '';
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        foregroundEl!.style.backgroundImage = '';
    }

    /// Bouncing ball components, credit https://stackoverflow.com/a/29982343
    const gravity: number = 0.6,
        damping: number = 0.9,
        traction: number = 0.8,
        interval: number = 1000 / 24; // msec for single frame
    let then: number = 0; // last draw
    var ballState: BallState;

    function resetBall() {
        if (canvas) {
            canvas.style.display = 'block';
        }
        ballState = new BallState(100, 100, 4, 5);
    }

    function throwBall() {
        if (!ballState.paused) {
            requestAnimationFrame(throwBall);
        }

        // throttling the frame rate
        const now = Date.now();
        const elapsed = now - then;
        if (elapsed <= interval) {
            return;
        }
        then = now - (elapsed % interval);

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (ballState.cx + ballRadius >= canvas.width) {
            ballState.vx = -ballState.vx * damping;
            ballState.cx = canvas.width - ballRadius;
        } else if (ballState.cx - ballRadius <= 0) {
            ballState.vx = -ballState.vx * damping;
            ballState.cx = ballRadius;
        }
        if (ballState.cy + ballRadius + floor >= canvas.height) {
            ballState.vy = -ballState.vy * damping;
            ballState.cy = canvas.height - ballRadius - floor;
            // traction here
            ballState.vx *= traction;
        } else if (ballState.cy - ballRadius <= 0) {
            ballState.vy = -ballState.vy * damping;
            ballState.cy = ballRadius;
        }

        ballState.vy += gravity;

        ballState.cx += ballState.vx;
        ballState.cy += ballState.vy;

        ctx.beginPath();
        ctx.arc(ballState.cx, ballState.cy, ballRadius, 0, 2 * Math.PI, false);
        ctx.fillStyle = '#2ed851';
        ctx.fill();
    }

    console.log('Starting pet session', petColor, basePetUri, petType);
    // New session
    var state = stateApi.getState();
    if (!state) {
        console.log('No state, starting a new session.');
        petCounter = 1;
        allPets.push(
            addPetToPanel(
                petType,
                basePetUri,
                displayNameTag,
                petColor,
                petSize,
                randomStartPosition(),
                floor,
                floor,
                randomName(petType),
                stateApi,
            ),
        );
        saveState(stateApi);
    } else {
        console.log('Recovering state - ', state);
        recoverState(basePetUri, displayNameTag, petSize, floor, stateApi);
    }

    initCanvas();

    // Handle messages sent from the extension to the webview
    window.addEventListener('message', (event): void => {
        const message = event.data; // The json data that the extension sent
        switch (message.command) {
            case 'throw-ball':
                resetBall();
                throwBall();
                allPets.pets().forEach((petEl) => {
                    if (petEl.pet.canChase()) {
                        petEl.pet.chase(ballState, canvas);
                    }
                });
                break;
            case 'spawn-pet':
                allPets.push(
                    addPetToPanel(
                        message.type,
                        basePetUri,
                        displayNameTag,
                        message.color,
                        petSize,
                        randomStartPosition(),
                        floor,
                        floor,
                        message.name ?? randomName(message.type),
                        stateApi,
                    ),
                );
                saveState(stateApi);
                break;

            case 'list-pets':
                var pets = allPets.pets();
                stateApi?.postMessage({
                    command: 'list-pets',
                    text: pets
                        .map(
                            (pet) =>
                                `${pet.type},${pet.pet.name()},${pet.color}`,
                        )
                        .join('\n'),
                });
                break;

            case 'roll-call':
                var pets = allPets.pets();
                // go through every single
                // pet and then print out their name
                pets.forEach((pet) => {
                    stateApi?.postMessage({
                        command: 'info',
                        text: `${pet.pet.emoji()} ${pet.pet.name()} (${
                            pet.color
                        } ${pet.type}): ${pet.pet.hello()}`,
                    });
                });
            case 'delete-pet':
                var pet = allPets.locate(message.name);
                if (pet) {
                    allPets.remove(message.name);
                    saveState(stateApi);
                    stateApi?.postMessage({
                        command: 'info',
                        text: '👋 Removed pet ' + message.name,
                    });
                } else {
                    stateApi?.postMessage({
                        command: 'error',
                        text: `Could not find pet ${message.name}`,
                    });
                }
                break;
            case 'reset-pet':
                allPets.reset();
                petCounter = 0;
                saveState(stateApi);
                break;
            case 'pause-pet':
                petCounter = 1;
                saveState(stateApi);
                break;
        }
    });
}
window.addEventListener('resize', function () {
    initCanvas();
});
