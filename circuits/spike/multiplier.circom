pragma circom 2.0.0;

template Multiplier() {
    signal input a;
    signal input b;
    signal input c;
    
    c === a * b;
}

component main { public [c] } = Multiplier();
