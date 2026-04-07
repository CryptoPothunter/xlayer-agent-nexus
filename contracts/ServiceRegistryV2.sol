// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title ServiceRegistryV2
 * @notice Upgraded on-chain registry for Agent-to-Agent services on X Layer
 * @dev Adds Ownable + Pausable patterns, escrow/payment mechanism for x402,
 *      richer events, and utility view functions. All V1 functionality preserved.
 */
contract ServiceRegistryV2 {
    // ─── Ownable ──────────────────────────────────────────

    address private _owner;

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    modifier onlyOwner() {
        require(msg.sender == _owner, "Ownable: caller is not the owner");
        _;
    }

    function owner() public view returns (address) {
        return _owner;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Ownable: new owner is the zero address");
        emit OwnershipTransferred(_owner, newOwner);
        _owner = newOwner;
    }

    // ─── Pausable ─────────────────────────────────────────

    bool private _paused;

    event Paused(address account);
    event Unpaused(address account);

    modifier whenNotPaused() {
        require(!_paused, "Pausable: paused");
        _;
    }

    modifier whenPaused() {
        require(_paused, "Pausable: not paused");
        _;
    }

    function paused() public view returns (bool) {
        return _paused;
    }

    /// @notice Pause all state-changing operations (onlyOwner)
    function pause() external onlyOwner whenNotPaused {
        _paused = true;
        emit Paused(msg.sender);
    }

    /// @notice Unpause the contract (onlyOwner)
    function unpause() external onlyOwner whenPaused {
        _paused = false;
        emit Unpaused(msg.sender);
    }

    // ─── Data Structures ──────────────────────────────────

    struct Service {
        address provider;
        string name;
        string description;
        string endpoint;       // HTTP endpoint for x402 payment
        uint256 pricePerCall;  // Price in wei (USDT on X Layer)
        uint256 totalCalls;
        uint256 totalRevenue;
        uint256 rating;        // Cumulative rating score
        uint256 ratingCount;
        bool active;
        uint256 registeredAt;
    }

    struct AgentProfile {
        address wallet;
        string name;
        uint256 totalServicesProvided;
        uint256 totalServicesConsumed;
        uint256 totalSpent;
        uint256 totalEarned;
        uint256 reputationScore;
        bool registered;
    }

    /// @dev Escrow entry for a deposited payment awaiting release or refund.
    struct Escrow {
        address depositor;      // Agent who deposited funds
        bytes32 serviceId;      // The bytes32 service key
        uint256 amount;         // Amount held in escrow
        bool settled;           // True once released or refunded
    }

    // ─── State Variables ──────────────────────────────────

    /// @notice Registered services keyed by serviceId hash
    mapping(bytes32 => Service) public services;

    /// @notice Agent profiles keyed by wallet address
    mapping(address => AgentProfile) public agents;

    /// @notice Service ids owned by each agent
    mapping(address => bytes32[]) public agentServices;

    /// @notice Ordered list of all service ids ever registered
    bytes32[] public allServiceIds;

    /// @notice Payment token address (e.g. USDT on X Layer)
    address public paymentToken;

    /// @dev Auto-incrementing call/escrow id
    uint256 private _nextCallId;

    /// @notice Escrow records keyed by callId
    mapping(uint256 => Escrow) public escrows;

    // ─── Events ───────────────────────────────────────────

    event AgentRegistered(address indexed agent, string name);
    event ServiceRegistered(
        bytes32 indexed serviceId,
        address indexed provider,
        string name,
        uint256 price
    );
    event ServiceCalled(
        bytes32 indexed serviceId,
        address indexed caller,
        address indexed provider,
        uint256 price
    );
    event ServiceRated(
        bytes32 indexed serviceId,
        address indexed rater,
        uint8 rating
    );
    event ServiceDeactivated(bytes32 indexed serviceId);
    event ServicePriceUpdated(
        bytes32 indexed serviceId,
        uint256 oldPrice,
        uint256 newPrice
    );
    event PaymentDeposited(
        uint256 indexed callId,
        bytes32 indexed serviceId,
        address indexed depositor,
        uint256 amount
    );
    event PaymentReleased(
        uint256 indexed callId,
        bytes32 indexed serviceId,
        address indexed provider,
        uint256 amount
    );
    event PaymentRefunded(
        uint256 indexed callId,
        bytes32 indexed serviceId,
        address indexed depositor,
        uint256 amount
    );

    // ─── Modifiers ────────────────────────────────────────

    modifier onlyRegisteredAgent() {
        require(agents[msg.sender].registered, "Agent not registered");
        _;
    }

    modifier onlyServiceProvider(bytes32 serviceId) {
        require(services[serviceId].provider == msg.sender, "Not service provider");
        _;
    }

    // ─── Constructor ──────────────────────────────────────

    constructor(address _paymentToken) {
        _owner = msg.sender;
        paymentToken = _paymentToken;
        _paused = false;
        _nextCallId = 1;
        emit OwnershipTransferred(address(0), msg.sender);
    }

    // ═══════════════════════════════════════════════════════
    // Agent Functions
    // ═══════════════════════════════════════════════════════

    /**
     * @notice Register a new agent profile.
     * @param name Human-readable name for the agent.
     */
    function registerAgent(string calldata name) external whenNotPaused {
        require(!agents[msg.sender].registered, "Already registered");
        agents[msg.sender] = AgentProfile({
            wallet: msg.sender,
            name: name,
            totalServicesProvided: 0,
            totalServicesConsumed: 0,
            totalSpent: 0,
            totalEarned: 0,
            reputationScore: 100,
            registered: true
        });
        emit AgentRegistered(msg.sender, name);
    }

    // ═══════════════════════════════════════════════════════
    // Service Functions
    // ═══════════════════════════════════════════════════════

    /**
     * @notice Register a new service. Only registered agents may call this.
     * @param name        Short service name.
     * @param description Longer description of what the service does.
     * @param endpoint    HTTP endpoint for x402 payment negotiation.
     * @param pricePerCall Price in wei (e.g. USDT on X Layer).
     * @return serviceId  The keccak256 identifier for the new service.
     */
    function registerService(
        string calldata name,
        string calldata description,
        string calldata endpoint,
        uint256 pricePerCall
    ) external onlyRegisteredAgent whenNotPaused returns (bytes32 serviceId) {
        serviceId = keccak256(abi.encodePacked(msg.sender, name, block.timestamp));

        services[serviceId] = Service({
            provider: msg.sender,
            name: name,
            description: description,
            endpoint: endpoint,
            pricePerCall: pricePerCall,
            totalCalls: 0,
            totalRevenue: 0,
            rating: 0,
            ratingCount: 0,
            active: true,
            registeredAt: block.timestamp
        });

        agentServices[msg.sender].push(serviceId);
        allServiceIds.push(serviceId);

        emit ServiceRegistered(serviceId, msg.sender, name, pricePerCall);
    }

    /**
     * @notice Record a service call (called after x402 payment is verified off-chain).
     * @dev May be called by the service provider or the contract owner.
     * @param serviceId The service that was called.
     * @param caller    The agent address that consumed the service.
     */
    function recordServiceCall(
        bytes32 serviceId,
        address caller
    ) external whenNotPaused {
        Service storage svc = services[serviceId];
        require(svc.active, "Service not active");
        require(svc.provider == msg.sender || msg.sender == _owner, "Unauthorized");

        svc.totalCalls++;
        svc.totalRevenue += svc.pricePerCall;

        AgentProfile storage provider = agents[svc.provider];
        provider.totalServicesProvided++;
        provider.totalEarned += svc.pricePerCall;

        if (agents[caller].registered) {
            agents[caller].totalServicesConsumed++;
            agents[caller].totalSpent += svc.pricePerCall;
        }

        emit ServiceCalled(serviceId, caller, svc.provider, svc.pricePerCall);
    }

    /**
     * @notice Rate a service (1-5). Only registered agents may rate.
     * @param serviceId The service to rate.
     * @param score     Rating from 1 (worst) to 5 (best).
     */
    function rateService(bytes32 serviceId, uint8 score) external onlyRegisteredAgent whenNotPaused {
        require(score >= 1 && score <= 5, "Score must be 1-5");
        Service storage svc = services[serviceId];
        require(svc.active, "Service not active");

        svc.rating += score;
        svc.ratingCount++;

        // Exponential moving average for provider reputation
        AgentProfile storage provider = agents[svc.provider];
        provider.reputationScore = (provider.reputationScore * 9 + score * 20) / 10;

        emit ServiceRated(serviceId, msg.sender, score);
    }

    /**
     * @notice Update the price for a service. Only the provider may call this.
     * @param serviceId The service to update.
     * @param newPrice  New price in wei.
     */
    function updateServicePrice(bytes32 serviceId, uint256 newPrice)
        external
        onlyServiceProvider(serviceId)
        whenNotPaused
    {
        uint256 oldPrice = services[serviceId].pricePerCall;
        services[serviceId].pricePerCall = newPrice;
        emit ServicePriceUpdated(serviceId, oldPrice, newPrice);
    }

    /**
     * @notice Deactivate a service so it no longer appears as available.
     * @param serviceId The service to deactivate.
     */
    function deactivateService(bytes32 serviceId)
        external
        onlyServiceProvider(serviceId)
        whenNotPaused
    {
        services[serviceId].active = false;
        emit ServiceDeactivated(serviceId);
    }

    // ═══════════════════════════════════════════════════════
    // Escrow / Payment Functions (x402)
    // ═══════════════════════════════════════════════════════

    /**
     * @notice Deposit native currency into escrow for a service call.
     *         The deposited amount must be >= the service's pricePerCall.
     * @param serviceId The service the caller intends to use.
     * @return callId   A unique escrow/call identifier.
     */
    function deposit(bytes32 serviceId)
        external
        payable
        whenNotPaused
        returns (uint256 callId)
    {
        Service storage svc = services[serviceId];
        require(svc.active, "Service not active");
        require(msg.value >= svc.pricePerCall, "Insufficient payment");

        callId = _nextCallId++;
        escrows[callId] = Escrow({
            depositor: msg.sender,
            serviceId: serviceId,
            amount: msg.value,
            settled: false
        });

        emit PaymentDeposited(callId, serviceId, msg.sender, msg.value);
    }

    /**
     * @notice Release escrowed funds to the service provider after delivery.
     *         Only the service provider may call this.
     * @param serviceId The service that was delivered.
     * @param callId    The escrow id returned by `deposit`.
     */
    function releasePayment(bytes32 serviceId, uint256 callId)
        external
        whenNotPaused
    {
        Escrow storage e = escrows[callId];
        require(!e.settled, "Already settled");
        require(e.serviceId == serviceId, "Service mismatch");

        Service storage svc = services[serviceId];
        require(svc.provider == msg.sender, "Not service provider");

        e.settled = true;

        // Update accounting
        svc.totalCalls++;
        svc.totalRevenue += e.amount;

        AgentProfile storage provider = agents[svc.provider];
        provider.totalServicesProvided++;
        provider.totalEarned += e.amount;

        if (agents[e.depositor].registered) {
            agents[e.depositor].totalServicesConsumed++;
            agents[e.depositor].totalSpent += e.amount;
        }

        // Transfer funds to provider
        (bool success, ) = payable(svc.provider).call{value: e.amount}("");
        require(success, "Transfer failed");

        emit PaymentReleased(callId, serviceId, svc.provider, e.amount);
        emit ServiceCalled(serviceId, e.depositor, svc.provider, e.amount);
    }

    /**
     * @notice Refund escrowed funds back to the depositor. Only the contract
     *         owner may issue refunds (e.g. if the service failed to deliver).
     * @param serviceId The service associated with the escrow.
     * @param callId    The escrow id returned by `deposit`.
     */
    function refund(bytes32 serviceId, uint256 callId)
        external
        onlyOwner
        whenNotPaused
    {
        Escrow storage e = escrows[callId];
        require(!e.settled, "Already settled");
        require(e.serviceId == serviceId, "Service mismatch");

        e.settled = true;

        (bool success, ) = payable(e.depositor).call{value: e.amount}("");
        require(success, "Refund transfer failed");

        emit PaymentRefunded(callId, serviceId, e.depositor, e.amount);
    }

    // ═══════════════════════════════════════════════════════
    // View Functions
    // ═══════════════════════════════════════════════════════

    /// @notice Total number of services ever registered.
    function getServiceCount() external view returns (uint256) {
        return allServiceIds.length;
    }

    /// @notice Retrieve full Service struct by its id.
    function getServiceById(bytes32 serviceId) external view returns (Service memory) {
        return services[serviceId];
    }

    /// @notice Alias kept for V1 compatibility (`getService`-style access).
    function getService(bytes32 serviceId) external view returns (Service memory) {
        return services[serviceId];
    }

    /// @notice Get all service ids owned by a given agent.
    function getAgentServices(address agent) external view returns (bytes32[] memory) {
        return agentServices[agent];
    }

    /// @notice Get the full profile for an agent.
    function getAgentProfile(address agent) external view returns (AgentProfile memory) {
        return agents[agent];
    }

    /// @notice Alias kept for V1 compatibility.
    function getAgent(address agent) external view returns (AgentProfile memory) {
        return agents[agent];
    }

    /**
     * @notice Return all currently active services.
     * @return activeIds      Array of active service id hashes.
     * @return activeServices Array of corresponding Service structs.
     */
    function getAllActiveServices()
        external
        view
        returns (bytes32[] memory activeIds, Service[] memory activeServices)
    {
        uint256 count = 0;
        for (uint256 i = 0; i < allServiceIds.length; i++) {
            if (services[allServiceIds[i]].active) count++;
        }

        activeIds = new bytes32[](count);
        activeServices = new Service[](count);
        uint256 idx = 0;
        for (uint256 i = 0; i < allServiceIds.length; i++) {
            if (services[allServiceIds[i]].active) {
                activeIds[idx] = allServiceIds[i];
                activeServices[idx] = services[allServiceIds[i]];
                idx++;
            }
        }
    }

    /**
     * @notice Compute the average rating for a service (multiplied by 100 for precision).
     * @param serviceId The service to query.
     * @return Average rating * 100, or 0 if unrated.
     */
    function getAverageRating(bytes32 serviceId) external view returns (uint256) {
        Service memory svc = services[serviceId];
        if (svc.ratingCount == 0) return 0;
        return (svc.rating * 100) / svc.ratingCount;
    }

    /**
     * @notice Return the top services sorted by totalCalls (descending).
     * @dev Uses a simple in-memory insertion sort. Suitable for moderate
     *      registry sizes; for very large registries consider off-chain indexing.
     * @param limit Maximum number of services to return.
     * @return topIds      Service id hashes, sorted by call count descending.
     * @return topServices Corresponding Service structs.
     */
    function getTopServices(uint256 limit)
        external
        view
        returns (bytes32[] memory topIds, Service[] memory topServices)
    {
        uint256 total = allServiceIds.length;
        if (limit > total) limit = total;
        if (limit == 0) {
            return (new bytes32[](0), new Service[](0));
        }

        // Build a temporary copy of ids and call counts, then partial-sort.
        bytes32[] memory ids = new bytes32[](total);
        uint256[] memory calls = new uint256[](total);
        for (uint256 i = 0; i < total; i++) {
            ids[i] = allServiceIds[i];
            calls[i] = services[ids[i]].totalCalls;
        }

        // Selection-sort the first `limit` entries (most calls first).
        for (uint256 i = 0; i < limit; i++) {
            uint256 maxIdx = i;
            for (uint256 j = i + 1; j < total; j++) {
                if (calls[j] > calls[maxIdx]) {
                    maxIdx = j;
                }
            }
            if (maxIdx != i) {
                // Swap
                (ids[i], ids[maxIdx]) = (ids[maxIdx], ids[i]);
                (calls[i], calls[maxIdx]) = (calls[maxIdx], calls[i]);
            }
        }

        // Copy the top `limit` results
        topIds = new bytes32[](limit);
        topServices = new Service[](limit);
        for (uint256 i = 0; i < limit; i++) {
            topIds[i] = ids[i];
            topServices[i] = services[ids[i]];
        }
    }

    /// @notice Accept native currency sent directly to the contract.
    receive() external payable {}
}
