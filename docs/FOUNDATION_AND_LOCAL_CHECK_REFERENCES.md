# Concrete, anchorage and hollow-section wall references (Phase 2, item 6)

Status: **for your review; nothing implemented.** Method: I searched the standards in `E:\HD3\Study Material\Books\Indian Code\Structural IS Codes\` (the library you pointed to) and read the relevant clauses of the supplied IS 800:2007 on the page images (`review-pack/images/IS800_*`). Where the library has no authoritative provision, I say so and do not substitute an international standard (the scope is Indian standards only).

## 1. Design jurisdiction and foundation system assumed from the tool
India (IS 800:2007 only). The tool models a **steel box / RHS column on a base plate with anchors (holding-down bolts) on a reinforced-concrete slab or pedestal**: inputs `bp_a, bp_b, bp_t, bp_fy` (plate), `bp_nA, bp_dA, bp_gA` (anchors), `fck`, `slab_h`, `slab_d`, `slab_rho` (concrete). Please confirm whether the foundation is (a) a slab on grade, (b) a suspended slab, (c) a pedestal on a footing; each changes which concrete clauses apply.

## 2. What the library offers, standard by standard

| Standard (in the library) | Edition seen | Relevant content | Use |
|---|---|---|---|
| **IS 800:2007** | Third Revision, 2007 (supplied) | **7.4 Column bases** (7.4.1 general, 7.4.1.1 effective projection, 7.4.2 gusseted, 7.4.3 slab bases, 7.4.3.1 minimum thickness); **Annex F-5 Column bases** (F-5.1 base plates, F-5.2 holding-down bolts) referenced by clause 10.6.1; 10.3.5 bolt tension | the **steel side is self-contained**: see section 3 |
| **IS 456:2000** | Plain and Reinforced Concrete, Fourth Revision (July 2000), 107 pp. | 34.4 transfer of load at the base of a column; 31.6 punching shear (31.6.1 critical section d/2, 31.6.3 permissible shear stress); 26.2 development length; footing clauses (34) | **concrete side**: bearing amplification √(A₁/A₂) ≤ 2, punching, anchorage of **reinforcement**. The supplied OCR text of 34.4 refers to "the permissible bearing stress in direct compression" without a number in the clause; the value must be located and read on the image before use |
| IS 800:1984 (`800.pdf`, `800-1984.pdf`) | First Revision, 16th reprint, amendments 1 and 2 | working-stress design | **not applicable** (superseded; different method) |
| IS 801:1975 | see Phase 1 | cold-formed members | OI-01 |
| IS 806:1988 | Steel tubes, First Revision, 11th reprint, "complementary to IS 800:1962" | use of steel **tubes** (IS 1161 circular), working stress | **not suitable** for rectangular hollow-section wall checks under IS 800:2007 (limit state); I found no local-buckling or wall-bearing provision in it |
| IS 4000:1992 and SP 6(4) | High strength bolts in steel structures; handbook on HSFG bolts | friction-grip bolting | OI-02c |
| IS 875 Parts 1-5, IS 1893 | loads (dead, imposed, wind, snow, special; earthquake) | the loads and the Table 4 combinations | outside this item |
| SP 6(1), (3), (5), (6), (7), SP 38, SP 40 | engineers' handbooks (rolled sections, columns and struts, cold-formed sections, plastic design, welding, etc.) | commentary and worked examples of the 1960s-80s | **independent worked examples** for verification (SP 6(5) for cold-formed sections, SP 6(3) for columns, SP 6(7) for welds) once the corresponding clause is implemented; not a substitute for the standard |
| IS 2062:2011, IS 1608:2005, IS 277, IS 513 | steel grades, tensile testing, galvanised and cold-rolled sheet | materials | grade properties (f_y by thickness) of IS 2062 are not yet verified in the register |

## 3. IS 800:2007 column bases: what the text provides (read on the page images)

**7.4.1 General** (printed p. 46): column bases "should have sufficient stiffness and strength to transmit axial force, bending moments and shear forces at the base of the columns to their foundation without exceeding the load carrying capacity of the supports. Anchor bolts and shear keys should be provided wherever necessary. **Shear resistance at the proper contact surface between steel base and concrete/grout may be calculated using a friction coefficient of 0.45.** The nominal bearing pressure between the base plate and the support below may be determined on the basis of **linearly varying distribution of pressure**. The maximum bearing pressure should not exceed the bearing strength equal to **0.6 f_ck**, where f_ck is the smaller of the **characteristic cube strength** of concrete or bedding material." (page images `IS800_7.4_column_bases_pdf52.png` and `..._pdf53.png` in `review-pack/images/`; the scan prints "0.6 f_ck" with an OCR-corrupted symbol, to be confirmed on the image).
**7.4.1.1:** an equal projection c of the base plate beyond the face of the column and gusset may be taken as effective (Fig. 9) when the plate is larger than needed.
**7.4.3.1 Slab bases:** minimum thickness t_s = √(2.5 w (a² − 0.3 b²) γ_m0 / f_y) ≥ t_f, with w the uniform pressure under the factored axial load and a, b the larger and smaller projection of the slab base beyond the rectangle circumscribing the column (symbol list, printed p. 6).
**Annex F-5.1 Base plates** (clause 10.6.1; printed p. 134): the bearing pressure on the foundation must not exceed the **design strength of the joint** between plate and foundation, "determined taking account of the material properties and dimensions of both the grout and the concrete foundation": no equation is given.
**F-5.2 Holding-down bolts:** F-5.2.1 provided if necessary to resist the design loads, designed for **tension due to uplift and bending moments**; F-5.2.2 the **lever arm** for tension from bending shall not be taken larger than the distance between the centroid of the bearing area on the compression side and the centroid of the bolt group on the tension side (tolerances on bolt positions to be taken into account); F-5.2.3 bolts shall be anchored into the foundation **by a hook or by a washer plate or other appropriate load-distributing member embedded in the concrete**; F-5.2.4 shear transfer: if no special elements, it must be demonstrated that sufficient resistance exists by (a) friction of the joint between base plate and foundation, (b) shear resistance of the holding-down bolts, (c) shear resistance of the surrounding part of the foundation, (d) shear and bearing resistance of shear-key plates.

## 4. What no supplied Indian standard provides
1. **The resistance of an anchor bolt in concrete** (tension: pull-out, concrete cone / breakout, side-face blow-out, splitting, edge effects; shear: concrete edge failure, pry-out). IS 800 F-5.2.3 gives only the qualitative requirement (hook / washer plate / load-distributing member) and IS 456 mentions "anchorage" only for reinforcing bars (26.2). **I found no clause with equations for cast-in or post-installed anchors in IS 456:2000, IS 800:2007 or the other standards of the library.** A verified check is therefore impossible without an additional document.
2. **Grout and bedding material strength:** F-5.1 requires it to be taken into account; no standard for the grout was supplied.
3. **Local resistance of a hollow-section wall** under concentrated forces (plate welded to a RHS face, bolted connection to a box wall): IS 800 10.1.2 only says that the ability of the web or flange to transfer local forces "should be checked and where necessary local stiffening provided"; it gives no resistance equation for hollow sections, and IS 806 does not cover it.

## 5. Options and what each needs from you (none selected)
| Subject | Option | Needs |
|---|---|---|
| Anchorage in concrete | **A.** Design out the failure modes: make the bolts anchored by washer plate or hook (F-5.2.3) and carry the bolt tension into the slab by **reinforcement** designed to IS 456 (26.2 development length, 34.4 dowels): then only IS 456 and IS 800 clauses are used. | your engineering decision on the detail, and the IS 456 clauses read and verified on images |
| | **B.** Use the anchor manufacturer's approved design data (test-based): the application reports "anchorage: external data" with the capacity as an **entered input** (as done for the joist anchorage) | the manufacturer data (not an Indian standard) |
| | **C.** Keep the anchorage pending (current state) | nothing |
| Concrete bearing / slab | implement **IS 800 7.4.1 (0.6 f_ck)** and **IS 456 34.4 (√(A₁/A₂) ≤ 2)** with the value of the permissible bearing stress read on the image, and **31.6 punching** (critical section d/2, k_s, τ_c) for a suspended slab only | decision on the foundation type (section 1); the f_ck definition: IS 800 7.4.1 says **cube** strength, the tool's input is "Concrete f_ck": it must be stated which |
| Shear at the base | IS 800 7.4.1 friction **μ = 0.45** (verified text), then bolt shear 10.3.3 (verified) and F-5.2.4 | your approval to implement; μ applies to the contact surface steel / concrete or grout (the plate on a levelled grout bed) |
| Base plate thickness | IS 800 7.4.3.1 slab base formula (text verified) and the bearing pressure distribution of 7.4.1 | approval; the existing code already uses the printed formula (clause shown as REVIEW because 7.4.3.1 is not yet verified in the register) |
| Hollow-section wall | no Indian reference found. **A.** design the connection so that the wall is not loaded locally (through-plates, internal stiffeners, solid plug) and state it; **B.** a reference or test data you supply | your decision / document |

## 6. Findings on the current defaults (review, not changed)
* The base-plate default **f_y = 275 N/mm²** (`bp_fy`) is not an IS 2062 grade value (the plate grades offered elsewhere are E250 / E350); the connection plates default to 250. Review the default.
* The help text of `slab_rho` still says "punching then uses v_min only", a term of the removed route; the IS 456 punching check does not use it. Wording to be corrected.
* The legacy base-plate shear check was reduced to "pending" during the conversion; with μ = 0.45 it could be re-implemented from the verified 7.4.1 text.

## 7. Documents and decisions I need
1. The foundation type (slab on grade, suspended slab, pedestal / footing) and whether the concrete strength is given as cube or cylinder strength.
2. Your decision on anchorage: option A, B or C above; if B, the manufacturer's data sheet; if A, the detail you intend.
3. For hollow-section walls: your decision (design out, or supply a reference).
4. Permission to read IS 456:2000 clauses 34.4, 31.6, 26.2 and 34.2.4 on the page images and report the exact text for review (the supplied scan is OCR with corrupted symbols).
